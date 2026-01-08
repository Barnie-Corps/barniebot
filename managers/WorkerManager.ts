import { Worker } from "worker_threads";
import Log from "../Log";
import EventEmitter from "events";
import { Collection } from "../classes/Collection";

export type WorkerHandle = { type: string; worker: Worker; id: string };
type WorkerWaiter = {
    resolve: (worker: WorkerHandle) => void;
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
    // Lightweight health/latency metrics per worker
    private metrics: Map<string, { lastPingMs?: number; avgPingMs?: number; failures: number; lastActiveAt?: number }> = new Map();
    constructor(public IDLength: number = 20, private cachePublic: boolean = false, public readonly typeLimit = 10, private keepAliveIntervalMs = 30000) {
        super();
    }
    public getWorker(id: string): { id: string, workerData: WorkerHandle } | null {
        const worker = this.Cache.get(id);
        return worker ? { id, workerData: worker } : null;
    };

    /**
     * Waits for an available worker of the specified type.
     * This function continuously checks for an available worker and resolves the promise once one is found.
     *
     * @param type - The type of worker to wait for.
     * @returns A promise that resolves with the found worker.
     */
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

    /**
     * Retrieves an available worker of the specified type from the cache.
     * 
     * @param type - The type of worker to retrieve.
     * @returns The first available worker of the specified type that is not currently running, or undefined if no such worker is found.
     */
    public getAvailableWorker(type: string): WorkerHandle | undefined {
        const pool = this.availableByType.get(type);
        if (!pool || pool.size === 0) return undefined;
        // Get one id from the set
        const id = pool.values().next().value as string | undefined;
        if (!id) return undefined;
        const handle = this.Cache.get(id);
        if (!handle) {
            pool.delete(id);
            return undefined;
        }
        // Double-check it's not running or reserved
        if (this.RunningCache.has(id) || this.reservations.has(id)) {
            // Not actually available, remove and try again recursively
            pool.delete(id);
            return this.getAvailableWorker(type);
        }
        return handle;
    };

    /**
     * Creates a new worker and manages its lifecycle.
     * 
     * @param path - The path to the worker script.
     * @param type - The type of the worker.
     * @param force - If true, forces the creation of a new worker even if the type limit is reached.
     * @param options - Optional worker options.
     * @param data - Optional data to be passed to the worker.
     * @returns An object containing the worker's ID, the worker instance, and its type.
     */
    public createWorker(path: string, type: string, force: boolean = false, options?: WorkerOptions, data?: any): WorkerHandle | null {
        const id = this.GenerateID(this.IDLength);
        if (this.Cache.filter(w => w.type === type).size >= this.typeLimit && !force) {
            return this.getAvailableWorker(type) ?? null;
        }
        const worker = new Worker(path, { ...options, workerData: { id, data: data ?? undefined } });
        this.Cache.set(id, { type, worker, id });
        // Register in type indices as pending/idle (will be made available on 'online')
        this.byType.set(type, (this.byType.get(type) ?? new Set()).add(id));
        worker.on("online", () => {
            Log.info(`Worker with ID ${id} and type ${type} online and running on ${path}${this.Cache.filter(w => w.type === type).size > this.typeLimit ? `. The workers type limit has been exceeded by the ${type} type..` : this.Cache.filter(w => w.type === type).size === this.typeLimit ? `. The workers type limit has been reached by the type ${type}` : ""}`, { workerId: id, workerType: type });
            this.addAvailable(id, type);
            this.scheduleKeepAlive(id, type);
            this.fulfillWaiters(type);
        });
        worker.on("message", message => {
            const m = this.metrics.get(id) ?? { failures: 0 };
            m.lastActiveAt = Date.now();
            this.metrics.set(id, m);
            this.markWorkerIdle(id, type);
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
            this.fulfillWaiters(type);
        });
        return { id, worker, type };
    };

    /**
     * Sends a message to a worker identified by the given ID.
     * 
     * @param id - The unique identifier of the worker.
     * @param message - The message to be sent to the worker.
     * @returns The unique identifier of the message.
     * @throws Will throw an error if the worker with the given ID is not found.
     */
    public postMessage(id: string, message: any): string {
        const worker = this.getWorker(id);
        if (!worker) throw new Error("Unknown worker");
        const messageId = this.GenerateID(this.IDLength);
        this.reservations.delete(id);
        this.clearKeepAliveTimer(id);
        worker.workerData.worker.postMessage({ id: messageId, data: message });
        this.RunningCache.set(id, { type: worker.workerData.type, id, worker: worker.workerData.worker });
        // Mark as no longer available
        this.removeAvailable(id, worker.workerData.type);
        return messageId;
    }

    /**
     * Waits for a specific response message from a worker.
     *
     * @param id - The unique identifier for the expected response.
     * @param message - The message object to match against the incoming response.
     * @returns A promise that resolves with an object containing the id and message when the expected response is received.
     */
    public awaitResponse(id: string, message: any, timeout?: number): Promise<{ id: string, message: any }> {
        return new Promise((resolve, reject) => {
            let timer: NodeJS.Timeout | null = null;
            const handler = (data: any) => {
                if (data.id !== id) return;
                if (data.message.id !== message) return;
                cleanup();
                resolve({ id: data.id, message: data.message });
            };
            const cleanup = () => {
                this.removeListener("message", handler);
                if (timer) {
                    clearTimeout(timer);
                    timer = null;
                }
            };
            if (typeof timeout === "number" && timeout > 0) {
                timer = setTimeout(() => {
                    cleanup();
                    reject(new Error("Worker response timed out"));
                }, timeout);
            }
            this.on("message", handler);
        });
    }

    /**
     * Terminates a worker with the given ID.
     * 
     * This method performs the following actions:
     * 1. Checks if the worker with the specified ID exists.
     * 2. If the worker exists, retrieves the worker data.
     * 3. Terminates the worker.
     * 4. Removes the worker from the cache.
     * 5. Logs a warning if the worker was running a task when terminated.
     * 6. Logs an info message if the worker was not running a task when terminated.
     * 
     * @param id - The unique identifier of the worker to be terminated.
     */
    public terminateWorker(id: string): void {
        const stored = this.getWorker(id);
        if (stored) {
            const workerData = stored.workerData;
            workerData.worker.terminate();
            this.Cache.delete(id);
            if (this.RunningCache.has(id)) {
                Log.warn(`Worker with ID ${id} and type ${workerData?.type} was running a task when terminated.`, { workerId: id, workerType: workerData?.type });
                this.RunningCache.delete(id);
            }
            else Log.info(`Worker with ID ${id} and type ${workerData?.type} was terminated.`, { workerId: id, workerType: workerData?.type });
            this.reservations.delete(id);
            this.removeFromIndices(id, workerData.type);
            this.clearKeepAliveTimer(id);
            this.fulfillWaiters(workerData.type);
        }
    };

    /**
     * Sends a ping message to a worker and measures the round-trip time.
     * 
     * @param id - The unique identifier of the worker to ping.
     * @returns A promise that resolves with the round-trip time in milliseconds.
     */
    private ping(id: string): Promise<number> {
        const worker = this.getWorker(id);
        const start = Date.now();
        const message = this.postMessage(id, "ping");
        return new Promise((resolve, reject) => {
            const callback = (m: any) => {
                if (m.id !== message) return;
                const latency = Date.now() - start;
                const stats = this.metrics.get(id) ?? { failures: 0 };
                stats.lastPingMs = latency;
                // simple moving average
                stats.avgPingMs = typeof stats.avgPingMs === "number" ? (stats.avgPingMs * 0.7 + latency * 0.3) : latency;
                stats.failures = 0;
                stats.lastActiveAt = Date.now();
                this.metrics.set(id, stats);
                resolve(latency);
                worker?.workerData.worker.removeListener("message", callback);
            }
            worker?.workerData.worker.on("message", callback);
        });
    }

    /**
     * Public wrapper to ping a worker and get latency.
     */
    public async pingWorker(id: string, timeout = 2000): Promise<number> {
        const timed = Promise.race([
            this.ping(id),
            new Promise<number>((_, reject) => setTimeout(() => reject(new Error("Ping timed out")), timeout))
        ]);
        return timed as Promise<number>;
    }

    /**
     * Prewarm a pool of workers of the given type by ensuring at least minWorkers exist
     * and issuing a ping to each idle worker to keep the thread and module context warm.
     */
    public async prewarmType(type: string, minWorkers = 1, timeout = 2000): Promise<void> {
        const pool = this.availableByType.get(type);
        if (!pool || pool.size === 0) return;
        const ids = Array.from(pool.values());
        await Promise.allSettled(ids.map(id => this.pingWorker(id, timeout)));
    }

    /**
     * Retrieves the cache if it is publicly accessible.
     * 
     * @returns {Cache | null} The cache instance if `cachePublic` is true, otherwise null.
     */
    public get cache() {
        return this.cachePublic ? this.Cache : null;
    };

    /**
     * Returns a summary of workers and latency metrics for diagnostics.
     */
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

    /**
     * Generates a random numeric ID of the specified length.
     *
     * @param length - The length of the ID to generate.
     * @returns A string representing the generated numeric ID.
     */
    private GenerateID(length: number): string {
        const characters = "0123456789";
        let result = "";
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    };
    /**
     * Creates multiple workers of a specified type.
     *
     * @param path - The path to the worker script.
     * @param type - The type of the workers to create.
     * @param amount - The number of workers to create. If the amount exceeds the type limit, it will be capped at the type limit.
     * @param options - Optional configuration options for the workers.
     * @param data - Optional data to pass to the workers.
     * @returns An array of objects, each containing the type, worker instance, and id of the created workers.
     */
    public bulkCreateWorkers(path: string, type: string, amount: number, options?: WorkerOptions, data?: any): WorkerHandle[] {
        if (amount > this.typeLimit) amount = this.typeLimit;
        const workers: WorkerHandle[] = [];
        for (let i = 0; i < amount; i++) {
            const created = this.createWorker(path, type, true, options, data);
            if (created) workers.push(created);
        }
        return workers;
    }
    /**
     * Terminates all workers of a specified type.
     *
     * @param type - The type of workers to terminate.
     */
    public terminateWorkers(type: string): void {
        this.Cache.filter(w => w.type === type).forEach(w => this.terminateWorker(w.id));
    }
    /**
     * Terminates all workers.
     */
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
            }
            catch (error) {
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
        // Add small jitter to avoid synchronized pings
        const jitter = Math.floor(this.keepAliveIntervalMs * (0.85 + Math.random() * 0.3));
        const timer = setTimeout(() => {
            this.keepAliveTimers.delete(id);
            this.sendKeepAlive(id, type).catch(error => {
                if (this.Cache.has(id)) {
                    Log.warn(`Keep-alive ping failed for worker ${id}`, { workerId: id, workerType: type, error: error instanceof Error ? error.message : String(error) });
                    // If a keep-alive fails, terminate the worker so callers can recreate on demand.
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
            // If latency is abnormally high, note it; we don't kill the worker immediately
            if (latency > this.keepAliveIntervalMs * 1.5) {
                Log.warn(`Worker ${id} high keep-alive latency: ${latency}ms`, { workerId: id, workerType: type, latency });
            }
            this.metrics.set(id, stats);
        }
        catch (error) {
            if (this.Cache.has(id)) throw error;
        }
    }

    // --- Fast index helpers ---
    private addAvailable(id: string, type: string): void {
        if (!this.Cache.has(id)) return;
        let pool = this.availableByType.get(type);
        if (!pool) {
            pool = new Set<string>();
            this.availableByType.set(type, pool);
        }
        pool.add(id);
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
}