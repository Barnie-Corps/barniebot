export interface ProcessManagerOptions {
    script: string;
    autoRestart?: boolean;
    maxRestarts?: number;
    restartDelay?: number;
    crashPatterns?: string[];
    logFile?: string;
}
