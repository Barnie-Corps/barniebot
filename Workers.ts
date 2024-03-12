import WorkerManager from "./managers/WorkerManager";

const Workers = new WorkerManager(15, false);
Workers.setMaxListeners(0);

export default Workers;