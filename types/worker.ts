import type { Worker } from "worker_threads";

export type WorkerHandle = { type: string; worker: Worker; id: string };

export type WorkerWaiter = {
    resolve: (worker: WorkerHandle) => void;
    reject: (error: Error) => void;
    timeoutHandle?: NodeJS.Timeout;
};

export type PendingResponse = {
    resolve: (value: { id: string; message: any }) => void;
    reject: (error: Error) => void;
    timeoutHandle?: NodeJS.Timeout;
};
