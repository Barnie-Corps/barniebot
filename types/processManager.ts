export interface ProcessManagerOptions {
    script: string;
    autoRestart?: boolean;
    stopOnCleanExit?: boolean;
    maxRestarts?: number;
    restartDelay?: number;
    crashPatterns?: string[];
    crashContextLines?: number;
    logFile?: string;
    webhookUrl?: string;
    hangTimeoutMs?: number;
}
