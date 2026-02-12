import { Worker, WorkerOptions } from "worker_threads";
import Log from "../Log";
import EventEmitter from "events";
import { Collection } from "../classes/Collection";

export type WorkerHandle = { type: string; worker: Worker; id: string };

type WorkerWaiter = {
    resolve: (worker: WorkerHandle) => void;
    reject: (error: Error) => void;
    timeoutHandle?: NodeJS.Timeout;
};

type PendingResponse = {
    resolve: (value: { id: string; message: any }) => void;
    reject: (error: Error) => void;
    timeoutHandle?: NodeJS.Timeout;
};

export default class WorkerManager extends EventEmitter {
    private Cache: Collection<string, WorkerHandle> = new Collection();
    private RunningCache: Collection<string, WorkerHandle> = new Collection();
    private waitingQueues: Map<string, WorkerWaiter[]> = new Map();
    private keepAliveTimers: Map<string, NodeJS.Timeout> = new Map();
    private reservations: Set<string> = new Set();
    private byType: Map<string, Set<string>> = new Map();
    private availableByType: Map<string, Set<string>> = new Map();
    private metrics: Map<string, { lastPingMs?: number; avgPingMs?: number; failures: number; lastActiveAt?: number }> = new Map();
    private pendingResponses: Map<string, Map<string, PendingResponse>> = new Map();

    constructor(public IDLength: number = 20, private cachePublic: boolean = false, public readonly typeLimit = 10, private keepAliveIntervalMs = 30000) {
        super();
    }

    public getWorker(id: string): { id: string; workerData: WorkerHandle } | null {
        const worker = this.Cache.get(id);
        return worker ? { id, workerData: worker } : null;
    }

    public async AwaitAvailableWorker(type: string, timeout?: number): Promise<WorkerHandle> {
        const available = this.getAvailableWorker(type);
        if (available) {
            this.reservations.add(available.id);
            return available;
        }
        return new Promise((resolve, reject) => {
            const waiter: WorkerWaiter = {
                resolve: (worker) => resolve(worker),
                reject: (error) => reject(error)
            };
            if (typeof timeout === "number" && timeout > 0) {
                waiter.timeoutHandle = setTimeout(() => {
                    this.removeWaiter(type, waiter);
                    reject(new Error(`Timed out while waiting for a ${type} worker`));
                }, timeout);
            }
            this.enqueueWaiter(type, waiter);
            this.fulfillWaiters(type);
        });
    }

    public getAvailableWorker(type: string): WorkerHandle | undefined {
        const pool = this.availableByType.get(type);
        if (!pool || pool.size === 0) return undefined;
        for (const id of pool.values()) {
            const handle = this.Cache.get(id);
            if (!handle) {
                pool.delete(id);
                continue;
            }
            if (this.RunningCache.has(id) || this.reservations.has(id)) {
                pool.delete(id);
                continue;
            }
            return handle;
        }
        return undefined;
    }

    public createWorker(path: string, type: string, force: boolean = false, options?: WorkerOptions, data?: any, logOnline: boolean = true): WorkerHandle | null {
        const id = this.GenerateID(this.IDLength);
        const typeCount = this.getTypeCount(type);
        if (typeCount >= this.typeLimit && !force) {
            return this.getAvailableWorker(type) ?? null;
        }
        const worker = new Worker(path, { ...options, workerData: { id, data: data ?? undefined } });
        this.Cache.set(id, { type, worker, id });
        this.byType.set(type, (this.byType.get(type) ?? new Set()).add(id));
        worker.on("online", () => {
            if (logOnline) {
                const count = this.getTypeCount(type);
                const limitNote = count > this.typeLimit
                    ? `. The workers type limit has been exceeded by the ${type} type.`
                    : count === this.typeLimit
                        ? `. The workers type limit has been reached by the type ${type}`
                        : "";
                Log.info(`Worker with ID ${id} and type ${type} online and running on ${path}${limitNote}`, { workerId: id, workerType: type });
            }
            this.addAvailable(id, type);
            this.scheduleKeepAlive(id, type);
            this.fulfillWaiters(type);
        });
        worker.on("message", message => {
            const m = this.metrics.get(id) ?? { failures: 0 };
            m.lastActiveAt = Date.now();
            this.metrics.set(id, m);
            this.markWorkerIdle(id, type);
            this.resolvePending(id, message);
            this.emit("message", { id, message });
        });
        worker.on("exit", c => {
            Log.info(`Worker with ID ${id} and type ${type} exited with code ${c}`, { workerId: id, workerType: type, exitCode: c });
            this.Cache.delete(id);
            this.RunningCache.delete(id);
            this.reservations.delete(id);
            this.removeFromIndices(id, type);
            this.clearKeepAliveTimer(id);
            this.metrics.delete(id);
            this.rejectPendingForWorker(id, new Error("Worker exited"));
            this.fulfillWaiters(type);
        });
        return { id, worker, type };
    }

    public postMessage(id: string, message: any): string {
        const worker = this.getWorker(id);
        if (!worker) throw new Error("Unknown worker");
        const messageId = this.GenerateID(this.IDLength);
        this.reservations.delete(id);
        this.clearKeepAliveTimer(id);
        worker.workerData.worker.postMessage({ id: messageId, data: message });
        this.RunningCache.set(id, { type: worker.workerData.type, id, worker: worker.workerData.worker });
        this.removeAvailable(id, worker.workerData.type);
        return messageId;
    }

    public awaitResponse(id: string, message: any, timeout?: number): Promise<{ id: string; message: any }> {
        return new Promise((resolve, reject) => {
            const responseMap = this.pendingResponses.get(id) ?? new Map();
            const pending: PendingResponse = { resolve, reject };
            responseMap.set(String(message), pending);
            this.pendingResponses.set(id, responseMap);
            if (typeof timeout === "number" && timeout > 0) {
                pending.timeoutHandle = setTimeout(() => {
                    this.removePending(id, String(message));
                    this.recordFailure(id);
                    this.terminateWorker(id);
                    reject(new Error("Worker response timed out"));
                }, timeout);
            }
        });
    }

    public terminateWorker(id: string): void {
        const stored = this.getWorker(id);
        if (stored) {
            const workerData = stored.workerData;
            workerData.worker.terminate();
            this.Cache.delete(id);
            if (this.RunningCache.has(id)) {
                Log.warn(`Worker with ID ${id} and type ${workerData?.type} was running a task when terminated.`, { workerId: id, workerType: workerData?.type });
                this.RunningCache.delete(id);
            } else {
                Log.info(`Worker with ID ${id} and type ${workerData?.type} was terminated.`, { workerId: id, workerType: workerData?.type });
            }
            this.reservations.delete(id);
            this.removeFromIndices(id, workerData.type);
            this.clearKeepAliveTimer(id);
            this.fulfillWaiters(workerData.type);
        }
    }

    public async pingWorker(id: string, timeout = 2000): Promise<number> {
        const start = Date.now();
        const message = this.postMessage(id, "ping");
        await this.awaitResponse(id, message, timeout);
        const latency = Date.now() - start;
        const stats = this.metrics.get(id) ?? { failures: 0 };
        stats.lastPingMs = latency;
        stats.avgPingMs = typeof stats.avgPingMs === "number" ? (stats.avgPingMs * 0.7 + latency * 0.3) : latency;
        stats.failures = 0;
        stats.lastActiveAt = Date.now();
        this.metrics.set(id, stats);
        return latency;
    }

    public async prewarmType(type: string, minWorkers = 1, timeout = 2000): Promise<void> {
        const pool = this.availableByType.get(type);
        if (!pool || pool.size < Math.max(1, minWorkers)) return;
        const ids = Array.from(pool.values());
        await Promise.allSettled(ids.map(id => this.pingWorker(id, timeout)));
    }

    public get cache() {
        return this.cachePublic ? this.Cache : null;
    }

    public getWorkerStats(): {
        total: number;
        byType: Record<string, { total: number; available: number; running: number; avgPingMs?: number; lastPingMs?: number }>;
    } {
        const byTypeSummary: Record<string, { total: number; available: number; running: number; avgPingMs?: number; lastPingMs?: number }> = {};
        for (const [type, ids] of this.byType.entries()) {
            const available = this.availableByType.get(type)?.size ?? 0;
            let running = 0;
            let sumAvg = 0;
            let sumLast = 0;
            let countedAvg = 0;
            let countedLast = 0;
            for (const id of ids.values()) {
                if (this.RunningCache.has(id)) running++;
                const metric = this.metrics.get(id);
                if (metric?.avgPingMs) { sumAvg += metric.avgPingMs; countedAvg++; }
                if (metric?.lastPingMs) { sumLast += metric.lastPingMs; countedLast++; }
            }
            byTypeSummary[type] = {
                total: ids.size,
                available,
                running,
                avgPingMs: countedAvg ? +(sumAvg / countedAvg).toFixed(2) : undefined,
                lastPingMs: countedLast ? +(sumLast / countedLast).toFixed(2) : undefined
            };
        }
        return { total: this.Cache.size, byType: byTypeSummary };
    }

    private GenerateID(length: number): string {
        const characters = "0123456789";
        let result = "";
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    }

    public bulkCreateWorkers(path: string, type: string, amount: number, options?: WorkerOptions, data?: any): WorkerHandle[] {
        if (amount > this.typeLimit) amount = this.typeLimit;
        const workers: WorkerHandle[] = [];
        for (let i = 0; i < amount; i++) {
            const created = this.createWorker(path, type, true, options, data, false);
            if (created) workers.push(created);
        }
        if (workers.length > 0) {
            const label = workers.length === 1 ? "worker" : "workers";
            Log.info(`Created ${workers.length} ${type} ${label} on ${path}`, { workerType: type, count: workers.length, path });
        }
        return workers;
    }

    public terminateWorkers(type: string): void {
        this.Cache.filter(w => w.type === type).forEach(w => this.terminateWorker(w.id));
    }

    public terminateAllWorkers(): void {
        this.Cache.forEach(w => this.terminateWorker(w.id));
    }

    private enqueueWaiter(type: string, waiter: WorkerWaiter): void {
        const queue = this.waitingQueues.get(type) ?? [];
        queue.push(waiter);
        this.waitingQueues.set(type, queue);
    }

    private removeWaiter(type: string, waiter: WorkerWaiter): void {
        const queue = this.waitingQueues.get(type);
        if (!queue) return;
        const index = queue.indexOf(waiter);
        if (index !== -1) {
            queue.splice(index, 1);
        }
        if (waiter.timeoutHandle) {
            clearTimeout(waiter.timeoutHandle);
            waiter.timeoutHandle = undefined;
        }
        if (queue.length === 0) this.waitingQueues.delete(type);
        else this.waitingQueues.set(type, queue);
    }

    private fulfillWaiters(type: string): void {
        const queue = this.waitingQueues.get(type);
        if (!queue || queue.length === 0) return;
        let next = this.getAvailableWorker(type);
        while (next && queue.length > 0) {
            const waiter = queue.shift();
            if (!waiter) break;
            if (waiter.timeoutHandle) {
                clearTimeout(waiter.timeoutHandle);
                waiter.timeoutHandle = undefined;
            }
            this.reservations.add(next.id);
            try {
                waiter.resolve(next);
            } catch (error) {
                Log.warn(`Failed to resolve waiter for worker type ${type}`, { error: error instanceof Error ? error.message : String(error) });
            }
            next = this.getAvailableWorker(type);
        }
        if (queue.length === 0) this.waitingQueues.delete(type);
        else this.waitingQueues.set(type, queue);
    }

    private markWorkerIdle(id: string, type: string): void {
        if (!this.Cache.has(id)) return;
        this.RunningCache.delete(id);
        this.reservations.delete(id);
        this.addAvailable(id, type);
        this.scheduleKeepAlive(id, type);
        this.fulfillWaiters(type);
    }

    private clearKeepAliveTimer(id: string): void {
        const timer = this.keepAliveTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            this.keepAliveTimers.delete(id);
        }
    }

    private scheduleKeepAlive(id: string, type: string): void {
        if (this.keepAliveIntervalMs <= 0) return;
        if (!this.Cache.has(id) || this.RunningCache.has(id) || this.reservations.has(id)) return;
        this.clearKeepAliveTimer(id);
        const jitter = Math.floor(this.keepAliveIntervalMs * (0.85 + Math.random() * 0.3));
        const timer = setTimeout(() => {
            this.keepAliveTimers.delete(id);
            this.sendKeepAlive(id, type).catch(error => {
                if (this.Cache.has(id)) {
                    Log.warn(`Keep-alive ping failed for worker ${id}`, { workerId: id, workerType: type, error: error instanceof Error ? error.message : String(error) });
                    try { this.terminateWorker(id); } catch (_) {}
                }
            });
        }, jitter);
        if (typeof timer.unref === "function") timer.unref();
        this.keepAliveTimers.set(id, timer);
    }

    private async sendKeepAlive(id: string, type: string): Promise<void> {
        if (!this.Cache.has(id) || this.RunningCache.has(id) || this.reservations.has(id)) return;
        try {
            const latency = await this.pingWorker(id, Math.max(1000, this.keepAliveIntervalMs));
            const stats = this.metrics.get(id) ?? { failures: 0 };
            if (latency > this.keepAliveIntervalMs * 1.5) {
                Log.warn(`Worker ${id} high keep-alive latency: ${latency}ms`, { workerId: id, workerType: type, latency });
            }
            this.metrics.set(id, stats);
        } catch (error) {
            if (this.Cache.has(id)) throw error;
        }
    }

    private addAvailable(id: string, type: string): void {
        if (!this.Cache.has(id)) return;
        let pool = this.availableByType.get(type);
        if (!pool) {
            pool = new Set<string>();
            this.availableByType.set(type, pool);
        }
        pool.add(id);
    }

    private removePending(id: string, messageId: string): void {
        const responseMap = this.pendingResponses.get(id);
        if (!responseMap) return;
        const pending = responseMap.get(messageId);
        if (!pending) return;
        if (pending.timeoutHandle) {
            clearTimeout(pending.timeoutHandle);
            pending.timeoutHandle = undefined;
        }
        responseMap.delete(messageId);
        if (responseMap.size === 0) this.pendingResponses.delete(id);
    }

    private resolvePending(id: string, message: any): void {
        const messageId = message?.id;
        if (typeof messageId === "undefined") return;
        const responseMap = this.pendingResponses.get(id);
        if (!responseMap) return;
        const pending = responseMap.get(String(messageId));
        if (!pending) return;
        this.removePending(id, String(messageId));
        try {
            pending.resolve({ id, message });
        } catch (error) {
            Log.warn(`Failed to resolve pending response for worker ${id}`, { workerId: id, error: error instanceof Error ? error.message : String(error) });
        }
    }

    private rejectPendingForWorker(id: string, error: Error): void {
        const responseMap = this.pendingResponses.get(id);
        if (!responseMap) return;
        for (const [messageId, pending] of responseMap.entries()) {
            if (pending.timeoutHandle) {
                clearTimeout(pending.timeoutHandle);
                pending.timeoutHandle = undefined;
            }
            try {
                pending.reject(error);
            } catch (rejectError) {
                Log.warn(`Failed to reject pending response for worker ${id}`, { workerId: id, error: rejectError instanceof Error ? rejectError.message : String(rejectError) });
            }
            responseMap.delete(messageId);
        }
        this.pendingResponses.delete(id);
    }

    private recordFailure(id: string): void {
        const stats = this.metrics.get(id) ?? { failures: 0 };
        stats.failures += 1;
        this.metrics.set(id, stats);
    }

    private removeAvailable(id: string, type: string): void {
        const pool = this.availableByType.get(type);
        if (pool) {
            pool.delete(id);
            if (pool.size === 0) this.availableByType.delete(type);
        }
    }

    private removeFromIndices(id: string, type: string): void {
        const set = this.byType.get(type);
        if (set) {
            set.delete(id);
            if (set.size === 0) this.byType.delete(type);
        }
        this.removeAvailable(id, type);
    }

    private getTypeCount(type: string): number {
        return this.byType.get(type)?.size ?? 0;
    }
}
