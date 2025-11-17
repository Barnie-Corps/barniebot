import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import Log from "./Log";

interface ProcessManagerOptions {
    script: string;
    autoRestart: boolean;
    maxRestarts: number;
    restartDelay: number;
    crashPatterns: string[];
    logFile?: string;
}

export default class ProcessManager {
    private process: ChildProcess | null = null;
    private restartCount: number = 0;
    private isShuttingDown: boolean = false;
    private lastCrashTime: number = 0;
    private options: ProcessManagerOptions;
    private logStream: fs.WriteStream | null = null;
    public maxRestarts: number;

    constructor(options: Partial<ProcessManagerOptions> = {}) {
        this.options = {
            script: options.script || "index.ts",
            autoRestart: options.autoRestart ?? true,
            maxRestarts: options.maxRestarts || 5,
            restartDelay: options.restartDelay || 3000,
            crashPatterns: options.crashPatterns || [
                "Cannot enqueue after fatal error",
                "FATAL ERROR",
                "Segmentation fault",
                "Out of memory",
                "ECONNREFUSED",
                "ETIMEDOUT",
                "Connection lost",
                "Unexpected token",
                "MODULE_NOT_FOUND"
            ],
            logFile: options.logFile
        };
        this.maxRestarts = this.options.maxRestarts || 5;

        if (this.options.logFile) {
            this.logStream = fs.createWriteStream(this.options.logFile, { flags: "a" });
        }

        // Handle process signals
        process.on("SIGINT", () => this.shutdown("SIGINT"));
        process.on("SIGTERM", () => this.shutdown("SIGTERM"));
        process.on("uncaughtException", (error) => {
            this.log(`[ProcessManager] Uncaught Exception: ${error.stack}`);
            this.restart("Uncaught exception in process manager");
        });
    }

    public start(): void {
        if (this.process) {
            this.log("[ProcessManager] Process already running");
            return;
        }

        this.log(`[ProcessManager] Starting bot process: ${this.options.script}`);
        
        // Use tsx or ts-node to run TypeScript directly
        const runtime = fs.existsSync(path.join(process.cwd(), "node_modules", ".bin", "tsx")) 
            ? "tsx" 
            : "ts-node";

        this.process = spawn(runtime, [this.options.script], {
            stdio: ["inherit", "pipe", "pipe"],
            env: { ...process.env },
            cwd: process.cwd()
        });

        // Handle stdout
        if (this.process.stdout) {
            this.process.stdout.on("data", (data) => {
                const output = data.toString();
                process.stdout.write(output);
                this.analyzeOutput(output);
            });
        }

        // Handle stderr
        if (this.process.stderr) {
            this.process.stderr.on("data", (data) => {
                const error = data.toString();
                process.stderr.write(error);
                this.analyzeOutput(error);
            });
        }

        // Handle process exit
        this.process.on("exit", (code, signal) => {
            this.log(`[ProcessManager] Bot process exited with code ${code}, signal ${signal}`);
            
            if (!this.isShuttingDown && this.options.autoRestart) {
                const timeSinceLastCrash = Date.now() - this.lastCrashTime;
                
                // Reset restart count if it's been more than 1 hour since last crash
                if (timeSinceLastCrash > 3600000) {
                    this.restartCount = 0;
                }

                if (this.restartCount < this.options.maxRestarts) {
                    this.lastCrashTime = Date.now();
                    this.restartCount++;
                    
                    this.log(`[ProcessManager] Attempting restart ${this.restartCount}/${this.options.maxRestarts} in ${this.options.restartDelay}ms...`);
                    
                    setTimeout(() => {
                        this.process = null;
                        this.start();
                    }, this.options.restartDelay);
                } else {
                    this.log(`[ProcessManager] Max restart attempts (${this.options.maxRestarts}) reached. Manual intervention required.`);
                    this.notifyFailure();
                }
            } else {
                this.process = null;
            }
        });

        // Handle process errors
        this.process.on("error", (error) => {
            this.log(`[ProcessManager] Process error: ${error.message}`);
        });
    }

    public restart(reason?: string): void {
        this.log(`[ProcessManager] Restart requested${reason ? `: ${reason}` : ""}`);
        
        if (this.process) {
            this.isShuttingDown = true;
            this.process.kill("SIGTERM");
            
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    this.log("[ProcessManager] Force killing process...");
                    this.process.kill("SIGKILL");
                }
                
                this.isShuttingDown = false;
                this.process = null;
                
                setTimeout(() => {
                    this.start();
                }, 1000);
            }, 5000);
        } else {
            this.start();
        }
    }

    public shutdown(signal?: string): void {
        this.log(`[ProcessManager] Shutdown requested${signal ? ` (${signal})` : ""}`);
        this.isShuttingDown = true;

        if (this.process) {
            this.process.kill("SIGTERM");
            
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    this.log("[ProcessManager] Force killing process...");
                    this.process.kill("SIGKILL");
                }
                
                if (this.logStream) {
                    this.logStream.end();
                }
                
                process.exit(0);
            }, 10000);
        } else {
            if (this.logStream) {
                this.logStream.end();
            }
            process.exit(0);
        }
    }

    public getStatus(): any {
        return {
            running: !!this.process && !this.process.killed,
            pid: this.process?.pid,
            restartCount: this.restartCount,
            isShuttingDown: this.isShuttingDown,
            uptime: this.process ? Date.now() - (this.lastCrashTime || Date.now()) : 0
        };
    }

    private analyzeOutput(output: string): void {
        // Check for crash patterns
        for (const pattern of this.options.crashPatterns) {
            if (output.includes(pattern)) {
                this.log(`[ProcessManager] Critical error detected: ${pattern}`);
                
                // Immediate restart for fatal errors
                if (pattern.toLowerCase().includes("fatal") || 
                    pattern.includes("Cannot enqueue") ||
                    pattern.includes("Segmentation fault")) {
                    setTimeout(() => {
                        this.restart(`Critical error: ${pattern}`);
                    }, 1000);
                }
            }
        }
    }

    private log(message: string): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        
        if (this.logStream) {
            this.logStream.write(logMessage);
        }
        
        console.log(message);
    }

    private notifyFailure(): void {
        const errorFile = path.join(process.cwd(), "CRITICAL_FAILURE.txt");
        const errorMessage = `
CRITICAL FAILURE - ${new Date().toISOString()}
================================================

The bot process has failed ${this.options.maxRestarts} times and cannot auto-restart.
Manual intervention is required.

Restart count: ${this.restartCount}
Last crash: ${new Date(this.lastCrashTime).toISOString()}

Please check the logs and restart the process manager manually.

To restart: npm run start:managed
`;
        
        fs.writeFileSync(errorFile, errorMessage);
        this.log(`[ProcessManager] Critical failure notification written to ${errorFile}`);
    }
}

// If this file is run directly, start the process manager
if (require.main === module) {
    const manager = new ProcessManager({
        script: path.join(__dirname, "index.ts"),
        autoRestart: true,
        maxRestarts: 30,
        restartDelay: 3000,
        logFile: path.join(__dirname, "logs", "process-manager.log")
    });

    console.log("╔════════════════════════════════════════╗");
    console.log("║   BarnieBot Process Manager v1.0.0    ║");
    console.log("╚════════════════════════════════════════╝");
    console.log("");
    console.log("✓ Auto-restart enabled");
    console.log("✓ Crash detection active");
    console.log("✓ Monitoring for fatal errors");
    console.log(`✓ Maximum restarts set to ${manager.maxRestarts}`);
    console.log("");
    
    manager.start();
}
