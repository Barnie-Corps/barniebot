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

export type PMState = "starting" | "running" | "restarting" | "shuttingDown" | "stopped";

export interface RestartDecision {
    restart: boolean;
    resetCount: boolean;
    reason: string;
}
