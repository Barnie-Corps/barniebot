import { Collection } from "discord.js";
import { EventEmitter } from "events";
import { Worker, workerData } from "worker_threads";
import Log from "../Log";

export default class WorkerManager extends EventEmitter {
    private Cache: Collection<string, { type: string, worker: Worker, id: string }> = new Collection();
    private RunningCache: Collection<string, { type: string, worker: Worker, id: string }> = new Collection();
    constructor(public IDLength: number = 10, private cachePublic: boolean = false, public readonly typeLimit = 10) {
        super();
    }
    public getWorker(id: string): { id: string, workerData: { type: string, worker: Worker } } | null {
        const worker = this.Cache.get(id);
        return worker ? { id, workerData: worker } : null;
    };

    public getAvailableWorker(type: string) {
        return this.Cache.find(w => w.type === type && !this.RunningCache.has(w.id));
    };

    public createWorker(path: string, type: string, force: boolean = false, options?: WorkerOptions, data?: any) {
        const id = this.GenerateID(this.IDLength);
        if (this.Cache.filter(w => w.type === type).size >= this.typeLimit && !force) return this.getAvailableWorker(type);
        const worker = new Worker(path, { ...options, workerData: { id, data: data ?? undefined } });
        this.Cache.set(id, { type, worker, id });
        worker.on("online", () => Log.info("workers", `Worker with ID ${id} and type ${type} online and running on ${path}${this.Cache.filter(w => w.type === type).size > this.typeLimit ? `. The workers type limit has been exceeded by the ${type} type..` : this.Cache.filter(w => w.type === type).size === this.typeLimit ? `. The workers type limit has been reached by the type ${type}` : ""}`));
        worker.on("message", message => {
            if (this.RunningCache.has(id)) this.RunningCache.delete(id);
            this.emit("message", { id, message });
        });
        worker.on("exit", c => { Log.info("workers", `Worker with ID ${id} and type ${type} exited with code ${c}`); this.Cache.delete(id); this.RunningCache.delete(id) });
        return { id, worker, type };
    };

    public postMessage(id: string, message: any): string {
        if (!this.getWorker(id)) throw new Error("Unknown worker");
        const worker = this.getWorker(id);
        const messageId = this.GenerateID(this.IDLength);
        worker?.workerData.worker.postMessage({ id: messageId, data: message });
        this.RunningCache.set(id, { type: (worker as any).workerData.type as string, id, worker: (worker as any).workerData.worker as Worker });
        return messageId;
    }

    public awaitResponse(id: string, message: any): Promise<{ id: string, message: any }> {
        return new Promise((resolve, reject) => {
            this.on("message", data => {
                if (data.id !== id) return;
                if (data.message.id !== id) return;
                resolve({ id: data.id, message: data.message });
            });
        });
    }

    public terminateWorker(id: string): void {
        if (this.getWorker(id)) {
            const workerData = this.getWorker(id)?.workerData;
            this.getWorker(id)?.workerData.worker.terminate();
            this.Cache.delete(id);
            if (this.RunningCache.has(id)) {
                Log.warn("workers", `Worker with ID ${id} and type ${workerData?.type} was running a task when terminated.`);
                this.RunningCache.delete(id);
            }
            else Log.info("workers", `Worker with ID ${id} and type ${workerData?.type} was terminated.`);
        }
    };

    private ping(id: string): Promise<number> {
        const worker = this.getWorker(id);
        const start = Date.now();
        const message = this.postMessage(id, "ping");
        return new Promise((resolve, reject) => {
            const callback = (m: any) => {
                if (m.id !== message) return;
                resolve(Date.now() - start);
                worker?.workerData.worker.removeListener("message", callback);
            }
            worker?.workerData.worker.on("message", callback);
        });
    }

    public get cache() {
        return this.cachePublic ? this.Cache : null;
    };

    private GenerateID(length: number): string {
        const characters = "0123456789";
        let result = "";
        for (let i = 0; i < length; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    };
    public bulkCreateWorkers(path: string, type: string, amount: number, options?: WorkerOptions, data?: any) {
        if (amount > this.typeLimit) amount = this.typeLimit;
        const workers = [];
        for (let i = 0; i < amount; i++) {
            workers.push((this.createWorker(path, type, true, options, data) as unknown) as { type: string, worker: Worker, id: string });
        }
        return workers;
    }
}