import { Collection } from "discord.js";
import { EventEmitter } from "events";
import { Worker } from "worker_threads";
import Log from "../Log";

export default class WorkerManager extends EventEmitter {
    private Cache: Collection<string, { type: string, worker: Worker, id: string }> = new Collection();
    private RunningCache: Collection<string, { type: string, worker: Worker, id: string }> = new Collection();
    constructor(public IDLength: number = 10, private cachePublic: boolean = false) {
        super();
        setInterval(() => {
            Log.info("workers", `Workers report after 60 seconds: ${this.Cache.size} worker(s). ${this.RunningCache.size} worker(s) are running.`)
        }, 60000)
    }
    public getWorker(id: string): { id: string, workerData: { type: string, worker: Worker } } | null {
        const worker = this.Cache.get(id);
        return worker ? { id, workerData: worker } : null;
    };

    public getAvailableWorker(type: string) {
        return this.Cache.find(w => w.type === type && !this.RunningCache.has(w.id));
    };

    public createWorker(path: string, type: string, options?: WorkerOptions, data?: any) {
        const id = this.GenerateID(this.IDLength);
        const worker = new Worker(path, { ...options, workerData: { id, data: data ?? undefined } });
        this.Cache.set(id, { type, worker, id });
        worker.on("online", () => Log.info("workers", `Worker with ID ${id} and type ${type} online and running on ${path}`));
        worker.on("message", m => {
            if (this.RunningCache.has(id)) this.RunningCache.delete(id);
            this.emit("message", { id, message: m });
        });
        worker.on("exit", c => { Log.info("workers", `Worker with ID ${id} and type ${type} exited with code ${c}`); this.Cache.delete(id) });
        return { id, worker };
    };

    public postMessage(id: string, message: any): string {
        if (!this.getWorker(id)) throw new Error("Unknown worker");
        const worker = this.getWorker(id);
        const messageId = this.GenerateID(this.IDLength);
        worker?.workerData.worker.postMessage({ id: messageId, data: message });
        this.RunningCache.set(id, { type: (worker as any).workerData.type as string, id, worker: (worker as any).workerData.worker as Worker });
        return messageId;
    }

    public terminateWorker(id: string): void {
        if (this.getWorker(id)) { this.getWorker(id)?.workerData.worker.terminate(); this.Cache.delete(id) }
    };

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
}