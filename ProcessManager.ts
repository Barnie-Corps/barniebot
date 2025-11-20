
import { exec, spawnSync, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface ProcessManagerOptions {
    script: string;
    autoRestart?: boolean;
    maxRestarts?: number;
    restartDelay?: number;
    crashPatterns?: string[];
    logFile?: string;
}

export default class ProcessManager {
    private process: ChildProcess | null = null;
    private restartCount = 0;
    private isShuttingDown = false;
    private lastCrashTime = 0;
    private options: Required<Omit<ProcessManagerOptions, "logFile">> & { logFile?: string };
    private logStream: fs.WriteStream | null = null;
    public maxRestarts: number;

    constructor(options: ProcessManagerOptions) {
        this.options = {
            script: options.script || "index.ts",
            autoRestart: options.autoRestart !== false,
            maxRestarts: options.maxRestarts ?? 5,
            restartDelay: options.restartDelay ?? 3000,
            crashPatterns: options.crashPatterns ?? [
                "Cannot enqueue after fatal error",
                "Cannot enqueue Query after fatal error",
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
        this.maxRestarts = this.options.maxRestarts;

        if (this.options.logFile) {
            this.logStream = fs.createWriteStream(this.options.logFile, { flags: "a" });
        }

        process.on("SIGINT", () => this.shutdown("SIGINT"));
        process.on("SIGTERM", () => this.shutdown("SIGTERM"));
        process.on("uncaughtException", (error: Error) => {
            this.log(`[ProcessManager] Uncaught Exception: ${error.stack}`);
            this.restart("Uncaught exception in process manager");
        });
    }

    private detectRunner(): { cmd: string; args: string[] } | null {
        const tsFile = this.options.script;
        const jsFile = tsFile.replace(/\.ts$/, ".js");
        if (fs.existsSync(tsFile)) {
            try {
                spawnSync("npx", ["--no-install", "ts-node", "--version"], { stdio: "ignore" });
                return { cmd: "npx", args: ["ts-node", tsFile] };
            } catch { }
            try {
                spawnSync("npx", ["--no-install", "tsx", "--version"], { stdio: "ignore" });
                return { cmd: "npx", args: ["tsx", tsFile] };
            } catch { }
        }
        if (fs.existsSync(jsFile)) {
            return { cmd: "node", args: [jsFile] };
        }
        return null;
    }

    public start(): void {
        if (this.process) {
            this.log("[ProcessManager] Process already running");
            return;
        }
        const runner = this.detectRunner();
        if (!runner) {
            this.log("[ProcessManager] No runner found (tsx, ts-node, or node). Build JS or install TS runner.");
            return;
        }
        const fullCmd = `${runner.cmd} ${runner.args.map(a => (a.includes(" ") ? '"' + a + '"' : a)).join(" ")}`;
        this.log(`[ProcessManager] Starting bot process: ${fullCmd}`);
        this.process = exec(fullCmd, {
            cwd: process.cwd(),
            env: { ...process.env },
            maxBuffer: 10 * 1024 * 1024
        });
        this.attachHandlers();
    }

    private attachHandlers(): void {
        if (!this.process) return;
        if (this.process.stdout) {
            this.process.stdout.on("data", (data: Buffer) => {
                const output = data.toString();
                process.stdout.write(output);
                this.analyzeOutput(output);
            });
        }
        if (this.process.stderr) {
            this.process.stderr.on("data", (data: Buffer) => {
                const error = data.toString();
                process.stderr.write(error);
                this.analyzeOutput(error);
            });
        }
        this.process.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
            this.log(`[ProcessManager] Bot process exited with code ${code}, signal ${signal}`);
            if (!this.isShuttingDown && this.options.autoRestart) {
                const elapsed = Date.now() - this.lastCrashTime;
                if (elapsed > 3600000) this.restartCount = 0;
                if (this.restartCount < this.options.maxRestarts) {
                    this.lastCrashTime = Date.now();
                    this.restartCount++;
                    this.log(`[ProcessManager] Restart ${this.restartCount}/${this.options.maxRestarts} in ${this.options.restartDelay}ms`);
                    setTimeout(() => {
                        this.process = null;
                        this.start();
                    }, this.options.restartDelay);
                } else {
                    this.log(`[ProcessManager] Max restarts (${this.options.maxRestarts}) reached.`);
                    this.notifyFailure();
                }
            } else {
                this.process = null;
            }
        });
        this.process.on("error", (error: Error) => {
            this.log(`[ProcessManager] Process error: ${error.message}`);
        });
    }

    public restart(reason?: string): void {
        this.log(`[ProcessManager] Restart requested${reason ? ": " + reason : ""}`);
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
                setTimeout(() => this.start(), 1000);
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
                if (this.logStream) this.logStream.end();
                process.exit(0);
            }, 10000);
        } else {
            if (this.logStream) this.logStream.end();
            process.exit(0);
        }
    }

    public getStatus(): {
        running: boolean;
        pid: number | undefined;
        restartCount: number;
        isShuttingDown: boolean;
        uptime: number;
    } {
        return {
            running: !!this.process && !this.process.killed,
            pid: this.process?.pid,
            restartCount: this.restartCount,
            isShuttingDown: this.isShuttingDown,
            uptime: this.process ? Date.now() - (this.lastCrashTime || Date.now()) : 0
        };
    }

    private analyzeOutput(output: string): void {
        for (const pattern of this.options.crashPatterns) {
            if (output.includes(pattern)) {
                this.log(`[ProcessManager] Critical error detected: ${pattern}`);
                if (pattern.toLowerCase().includes("fatal") || pattern.includes("Cannot enqueue") || pattern.includes("Segmentation fault")) {
                    setTimeout(() => this.restart(`Critical error: ${pattern}`), 1000);
                }
            }
        }
    }

    private log(message: string): void {
        const line = `[${new Date().toISOString()}] ${message}\n`;
        if (this.logStream) this.logStream.write(line);
        console.log(message);
    }

    private notifyFailure(): void {
        const file = path.join(process.cwd(), "CRITICAL_FAILURE.txt");
        const body = `CRITICAL FAILURE - ${new Date().toISOString()}\n============================================\n\nThe bot process has failed ${this.options.maxRestarts} times and cannot auto-restart.\nManual intervention required.\n\nRestart count: ${this.restartCount}\nLast crash: ${new Date(this.lastCrashTime).toISOString()}\n\nCheck logs and restart manually (npm run start:managed).\n`;
        fs.writeFileSync(file, body);
        this.log(`[ProcessManager] Critical failure file written: ${file}`);
    }
}

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
