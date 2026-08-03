import { spawn, spawnSync, ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { emitKeypressEvents } from "readline";
import figlet from "figlet";
import type { ProcessManagerOptions } from "./types/processManager";

const color = (code: number) => (s: string) => `\u001b[${code}m${s}\u001b[0m`;
const green = color(32);
const yellow = color(33);
const red = color(31);
const cyan = color(36);
const dim = color(2);

type PMState = "starting" | "running" | "restarting" | "shuttingDown" | "stopped";

const RESTART_WINDOW_MS = 3600000;
const OUTPUT_BUFFER_LIMIT = 64 * 1024;
const MAX_LOG_BYTES = 5 * 1024 * 1024;

export function pickRunner(
    script: string,
    exists: (p: string) => boolean,
    available: (cmd: string, args: string[]) => boolean
): { cmd: string; args: string[] } | null {
    const jsFile = script.replace(/\.ts$/, ".js");
    if (exists(script)) {
        if (available("npx", ["--no-install", "ts-node", "--version"])) return { cmd: "npx", args: ["ts-node", script] };
        if (available("npx", ["--no-install", "tsx", "--version"])) return { cmd: "npx", args: ["tsx", script] };
    }
    if (exists(jsFile)) return { cmd: "node", args: [jsFile] };
    return null;
}

export function classifyCrash(code: number | null, signal: NodeJS.Signals | null): "clean" | "crash" {
    if (signal !== null) return "crash";
    return code === 0 ? "clean" : "crash";
}

export function isFatalPattern(pattern: string): boolean {
    const p = pattern.toLowerCase();
    return p.includes("fatal") || p.includes("cannot enqueue") || p.includes("segmentation fault");
}

export interface RestartDecision {
    restart: boolean;
    resetCount: boolean;
    reason: string;
}

export function decideRestart(args: {
    code: number | null;
    signal: NodeJS.Signals | null;
    isShuttingDown: boolean;
    autoRestart: boolean;
    stopOnCleanExit: boolean;
    restartCount: number;
    maxRestarts: number;
    elapsedSinceLastCrash: number;
    restartWindowMs: number;
}): RestartDecision {
    if (args.isShuttingDown || !args.autoRestart) return { restart: false, resetCount: false, reason: "disabled" };
    if (classifyCrash(args.code, args.signal) === "clean" && args.stopOnCleanExit) {
        return { restart: false, resetCount: false, reason: "clean exit" };
    }
    const resetCount = args.elapsedSinceLastCrash > args.restartWindowMs;
    if (args.restartCount >= args.maxRestarts) return { restart: false, resetCount, reason: "max restarts" };
    return { restart: true, resetCount, reason: "crash" };
}

export default class ProcessManager {
    private child: ChildProcess | null = null;
    private restartCount = 0;
    private isShuttingDown = false;
    private lastCrashTime = 0;
    private lastRestartScheduled = 0;
    private restartPending = false;
    private processStartTime = 0;
    private outputBuffer = "";
    private detectedPatterns = new Set<string>();
    private lastOutputAt = 0;
    private lastCrashPattern = "";
    private lastCrashContext = "";
    private state: PMState = "stopped";
    private hangTimer: NodeJS.Timeout | null = null;
    private options: Required<Omit<ProcessManagerOptions, "logFile" | "webhookUrl">> & { logFile?: string; webhookUrl?: string };
    private logStream: fs.WriteStream | null = null;
    private pidFile = "";
    private statusFile = "";
    public maxRestarts: number;

    constructor(options: ProcessManagerOptions) {
        const env = process.env;
        this.options = {
            script: options.script || "index.ts",
            autoRestart: options.autoRestart !== false,
            stopOnCleanExit: options.stopOnCleanExit !== false,
            maxRestarts: options.maxRestarts ?? (parseInt(env.PM_MAX_RESTARTS || "", 10) || 5),
            restartDelay: options.restartDelay ?? (parseInt(env.PM_RESTART_DELAY || "", 10) || 3000),
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
            crashContextLines: options.crashContextLines ?? 20,
            logFile: options.logFile,
            webhookUrl: options.webhookUrl || env.PM_WEBHOOK_URL,
            hangTimeoutMs: options.hangTimeoutMs ?? (parseInt(env.PM_HANG_TIMEOUT || "", 10) || 0)
        };
        this.maxRestarts = this.options.maxRestarts;

        if (this.options.logFile) {
            this.rollLogIfNeeded(this.options.logFile);
            this.logStream = fs.createWriteStream(this.options.logFile, { flags: "a" });
        }

        this.acquireLock();

        process.on("SIGINT", () => this.shutdown("SIGINT"));
        process.on("SIGTERM", () => this.shutdown("SIGTERM"));
        process.on("uncaughtException", (error: Error) => {
            this.log(`Uncaught exception: ${error.stack || error.message}`);
            this.restart("uncaught exception in process manager");
        });
        process.on("unhandledRejection", (error: any) => {
            this.log(`Unhandled rejection: ${(error as Error)?.stack || (error as Error)?.message || String(error)}`);
        });
    }

    public start(): void {
        if (this.child) {
            this.log("Process already running");
            return;
        }
        const runner = pickRunner(this.options.script, (p) => fs.existsSync(p), (cmd, args) => {
            try {
                return spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
            } catch {
                return false;
            }
        });
        if (!runner) {
            this.log("No runner found (tsx, ts-node, or node). Build JS or install a TS runner.");
            this.setState("stopped");
            return;
        }
        this.restartPending = false;
        this.detectedPatterns.clear();
        this.processStartTime = Date.now();
        this.lastOutputAt = Date.now();
        this.setState("starting");
        this.log(`Starting bot: ${runner.cmd} ${runner.args.join(" ")}`);
        const spawnOpts: any = {
            cwd: process.cwd(),
            env: { ...process.env },
            stdio: ["ignore", "pipe", "pipe"],
            detached: process.platform !== "win32"
        };
        if (process.platform === "win32") spawnOpts.shell = true;
        this.child = spawn(runner.cmd, runner.args, spawnOpts);
        this.attachHandlers();
        this.setState("running");
        if (this.options.hangTimeoutMs > 0) this.armHangWatch();
    }

    private attachHandlers(): void {
        if (!this.child) return;
        if (this.child.stdout) {
            this.child.stdout.on("data", (data: Buffer) => this.handleChildStream("out", data));
        }
        if (this.child.stderr) {
            this.child.stderr.on("data", (data: Buffer) => this.handleChildStream("err", data));
        }
        this.child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => this.handleExit(code, signal));
        this.child.on("error", (error: Error) => {
            this.log(`Process spawn error: ${error.message}`);
            this.child = null;
            this.processStartTime = 0;
            if (this.isShuttingDown || !this.options.autoRestart) {
                this.setState("stopped");
                return;
            }
            this.lastCrashPattern = "spawn error";
            this.lastCrashContext = error.stack || error.message;
            this.handleExit(null, null);
        });
    }

    private handleChildStream(stream: "out" | "err", data: Buffer): void {
        const output = data.toString();
        this.lastOutputAt = Date.now();
        if (stream === "out") process.stdout.write(output);
        else process.stderr.write(output);
        this.writeChildLog(stream, output);
        this.outputBuffer = (this.outputBuffer + output).slice(-OUTPUT_BUFFER_LIMIT);
        this.analyzeOutput();
    }

    private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
        this.stopHangWatch();
        this.log(`Bot exited with code ${code}, signal ${signal}${classifyCrash(code, signal) === "clean" ? " (clean)" : ""}`);
        const exitedPid = this.child?.pid;
        this.child = null;
        this.processStartTime = 0;

        const decision = decideRestart({
            code,
            signal,
            isShuttingDown: this.isShuttingDown,
            autoRestart: this.options.autoRestart,
            stopOnCleanExit: this.options.stopOnCleanExit,
            restartCount: this.restartCount,
            maxRestarts: this.options.maxRestarts,
            elapsedSinceLastCrash: Date.now() - this.lastCrashTime,
            restartWindowMs: RESTART_WINDOW_MS
        });

        if (decision.resetCount) this.restartCount = 0;
        if (!decision.restart) {
            if (decision.reason === "max restarts") {
                this.setState("stopped");
                this.notifyFailure(code, signal);
            } else {
                if (decision.reason === "clean exit") this.log("Clean exit. Process manager will not restart.");
                this.setState("stopped");
            }
            return;
        }
        this.killProcessGroup(exitedPid, "SIGKILL");
        this.restartCount++;
        this.lastCrashTime = Date.now();
        this.setState("restarting");
        this.log(`Restart ${this.restartCount}/${this.options.maxRestarts} in ${this.options.restartDelay}ms`);
        setTimeout(() => this.start(), this.options.restartDelay);
    }

    public restart(reason?: string): void {
        this.log(`Restart requested${reason ? ": " + reason : ""}`);
        if (this.restartPending) {
            this.log("Restart already pending. Ignoring request.");
            return;
        }
        this.restartPending = true;
        if (this.child) {
            this.isShuttingDown = true;
            this.setState("restarting");
            this.killChild("SIGTERM");
            setTimeout(() => {
                if (this.child) {
                    this.log("Force killing process group...");
                    this.killChild("SIGKILL");
                }
                this.isShuttingDown = false;
                this.child = null;
                this.restartPending = false;
                setTimeout(() => this.start(), 1000);
            }, 5000);
        } else {
            this.restartPending = false;
            this.start();
        }
    }

    private killProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
        if (!pid || process.platform === "win32") return;
        try {
            process.kill(-pid, signal);
        } catch (error: any) {
            if (error?.code !== "ESRCH") {
                this.log(`Failed to signal process group ${pid}: ${error?.message || String(error)}`);
            }
        }
    }

    private killChild(signal: NodeJS.Signals): void {
        const pid = this.child?.pid;
        if (!pid) return;
        this.killProcessGroup(pid, signal);
        try {
            this.child?.kill(signal);
        } catch {
        }
    }

    public shutdown(signal?: string): void {
        if (this.isShuttingDown) return;
        this.log(`Shutdown requested${signal ? ` (${signal})` : ""}`);
        this.isShuttingDown = true;
        this.setState("shuttingDown");
        if (this.child) {
            this.killChild("SIGTERM");
            const force = setTimeout(() => {
                if (this.child) {
                    this.log("Force killing process group...");
                    this.killChild("SIGKILL");
                }
                this.finishShutdown();
            }, 10000);
            this.child.once("exit", () => {
                clearTimeout(force);
                this.finishShutdown();
            });
        } else {
            this.finishShutdown();
        }
    }

    private finishShutdown(): void {
        this.releaseLock();
        this.removeStatusFile();
        if (this.logStream) this.logStream.end();
        process.exit(0);
    }

    public getStatus(): {
        running: boolean;
        pid: number | undefined;
        restartCount: number;
        isShuttingDown: boolean;
        uptime: number;
        state: PMState;
        lastCrashTime: number;
    } {
        return {
            running: !!this.child && !this.child.killed && this.state === "running",
            pid: this.child?.pid,
            restartCount: this.restartCount,
            isShuttingDown: this.isShuttingDown,
            uptime: this.child && this.processStartTime ? Math.floor((Date.now() - this.processStartTime) / 1000) : 0,
            state: this.state,
            lastCrashTime: this.lastCrashTime
        };
    }

    private analyzeOutput(): void {
        for (const pattern of this.options.crashPatterns) {
            if (this.outputBuffer.includes(pattern) && !this.detectedPatterns.has(pattern)) {
                this.detectedPatterns.add(pattern);
                this.log(`Critical error detected: ${pattern}`);
                if (isFatalPattern(pattern)) {
                    this.captureCrashContext(pattern);
                    this.scheduleRestart(`Critical error: ${pattern}`);
                }
            }
        }
    }

    private captureCrashContext(pattern: string): void {
        const lines = this.outputBuffer.split("\n").map((l) => l.trim()).filter(Boolean);
        this.lastCrashPattern = pattern;
        this.lastCrashContext = lines.slice(-this.options.crashContextLines).join("\n");
        this.log(`Crash context captured (${this.options.crashContextLines} lines).`);
    }

    private scheduleRestart(reason: string): void {
        const now = Date.now();
        if (this.restartPending || this.isShuttingDown) return;
        if (now - this.lastRestartScheduled < 10000) return;
        this.lastRestartScheduled = now;
        this.log(`Scheduling restart: ${reason}`);
        setTimeout(() => this.restart(reason), 1000);
    }

    private armHangWatch(): void {
        this.stopHangWatch();
        this.hangTimer = setInterval(() => {
            if (!this.child || this.isShuttingDown) return;
            if (Date.now() - this.lastOutputAt > this.options.hangTimeoutMs) {
                this.log(`No output for ${this.options.hangTimeoutMs}ms. Restarting hung process.`);
                this.restart("hang detection");
            }
        }, Math.min(this.options.hangTimeoutMs, 60000));
    }

    private stopHangWatch(): void {
        if (this.hangTimer) {
            clearInterval(this.hangTimer);
            this.hangTimer = null;
        }
    }

    private async notifyFailure(code: number | null, signal: NodeJS.Signals | null): Promise<void> {
        const file = path.join(process.cwd(), "CRITICAL_FAILURE.txt");
        const body = `CRITICAL FAILURE - ${new Date().toISOString()}\n============================================\n\nThe bot process has failed ${this.options.maxRestarts} times and cannot auto-restart.\nManual intervention required.\n\nRestart count: ${this.restartCount}\nLast crash: ${new Date(this.lastCrashTime).toISOString()}\nExit code: ${code}\nSignal: ${signal}\n\n--- Last output ---\n${this.lastCrashContext || "(no captured output)"}\n\nRestart with: npm run start:managed\n`;
        try {
            fs.writeFileSync(file, body);
            this.log(`Critical failure file written: ${file}`);
        } catch (error: any) {
            this.log(`Failed to write failure file: ${error?.message || String(error)}`);
        }
        if (this.options.webhookUrl) {
            try {
                await fetch(this.options.webhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        content: `🚨 **CRITICAL FAILURE**\nThe bot process failed ${this.options.maxRestarts} times and cannot auto-restart.\nLast crash: <t:${Math.floor(this.lastCrashTime / 1000)}:R>\nExit code: \`${code}\` | Signal: \`${signal}\`\nTriggered by: \`${this.lastCrashPattern || "exit"}\`\n\n\`\`\`\n${(this.lastCrashContext || "no captured output").slice(0, 1500)}\n\`\`\``
                    })
                });
                this.log("Webhook notification sent.");
            } catch (error: any) {
                this.log(`Webhook notification failed: ${error?.message || String(error)}`);
            }
        }
    }

    private rollLogIfNeeded(file: string): void {
        try {
            const stat = fs.statSync(file);
            if (stat.size > MAX_LOG_BYTES) {
                fs.renameSync(file, `${file}.1`);
                this.log(`Log file rotated to ${file}.1`);
            }
        } catch {
        }
    }

    private acquireLock(): void {
        this.pidFile = path.join(process.cwd(), ".pm.pid");
        this.statusFile = path.join(process.cwd(), ".pm.status.json");
        try {
            if (fs.existsSync(this.pidFile)) {
                const pid = parseInt(fs.readFileSync(this.pidFile, "utf8").trim(), 10);
                if (pid > 0) {
                    try {
                        process.kill(pid, 0);
                        this.log(`Another process manager instance appears to be running (PID ${pid}). Exiting.`);
                        process.exit(1);
                    } catch (error: any) {
                        if (error?.code === "ESRCH") fs.unlinkSync(this.pidFile);
                    }
                }
            }
            fs.writeFileSync(this.pidFile, String(process.pid));
        } catch (error: any) {
            this.log(`Failed to manage PID file: ${error?.message || String(error)}`);
        }
    }

    private releaseLock(): void {
        try {
            if (fs.existsSync(this.pidFile)) fs.unlinkSync(this.pidFile);
        } catch {
        }
    }

    private setState(state: PMState): void {
        this.state = state;
        this.printStatus();
        this.writeStatusFile();
    }

    public printStatus(): void {
        const s = this.getStatus();
        const stateLabel =
            s.state === "running" ? green("RUNNING")
            : s.state === "starting" ? cyan("STARTING")
            : s.state === "restarting" ? yellow("RESTARTING")
            : s.state === "shuttingDown" ? yellow("SHUTTING DOWN")
            : red("STOPPED");
        const crash = s.lastCrashTime ? new Date(s.lastCrashTime).toISOString() : "never";
        const rss = this.getChildRss();
        const mem = rss ? ` | RSS ${(rss / 1024 / 1024).toFixed(1)} MB` : "";
        console.log(`${dim("[PM]")} ${stateLabel} | PID ${s.pid ?? "-"} | Uptime ${this.formatDuration(s.uptime)} | Restarts ${s.restartCount}/${this.maxRestarts}${mem} | Last crash ${crash}`);
    }

    private writeStatusFile(): void {
        try {
            const s = this.getStatus();
            fs.writeFileSync(this.statusFile, JSON.stringify({
                pid: s.pid ?? null,
                state: s.state,
                running: s.running,
                restartCount: s.restartCount,
                maxRestarts: this.options.maxRestarts,
                restartDelay: this.options.restartDelay,
                startedAt: this.processStartTime || null,
                lastCrashTime: this.lastCrashTime || null,
                lastCrashPattern: this.lastCrashPattern || null,
                lastCrashContext: this.lastCrashContext ? this.lastCrashContext.slice(0, 1500) : null,
                isShuttingDown: this.isShuttingDown
            }, null, 2));
        } catch (error: any) {
            this.log(`Failed to write status file: ${error?.message || String(error)}`);
        }
    }

    private removeStatusFile(): void {
        try {
            if (fs.existsSync(this.statusFile)) fs.unlinkSync(this.statusFile);
        } catch {
        }
    }

    private getChildRss(): number {
        if (!this.child || !this.child.pid) return 0;
        try {
            const out = spawnSync("ps", ["-o", "rss=", "-p", String(this.child.pid)], { stdio: "pipe", encoding: "utf8" });
            if (out.status === 0) return parseInt((out.stdout || "").trim(), 10) * 1024;
        } catch {
        }
        return 0;
    }

    private formatDuration(seconds: number): string {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h) return `${h}h ${m}m ${s}s`;
        if (m) return `${m}m ${s}s`;
        return `${s}s`;
    }

    public startConsole(): void {
        if (!process.stdin.isTTY) return;
        emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.on("keypress", (_: string, key: any) => {
            if (key && key.ctrl && key.name === "c") {
                this.shutdown("Ctrl+C");
                return;
            }
            switch (key?.name) {
                case "r":
                    this.restart("manual");
                    break;
                case "s":
                case "q":
                    this.shutdown("manual");
                    break;
                case "c":
                    this.restartCount = 0;
                    this.log("Restart counter reset to 0.");
                    break;
                case "t":
                    this.printStatus();
                    break;
                case "h":
                    this.printHelp();
                    break;
            }
        });
        this.printHelp();
    }

    private printHelp(): void {
        console.log(`${dim("[PM]")} Keys: ${cyan("r")} restart | ${cyan("s")} shutdown | ${cyan("q")} quit | ${cyan("c")} reset counter | ${cyan("t")} status | ${cyan("h")} help | ${cyan("Ctrl+C")} quit`);
    }

    private log(message: string): void {
        const line = `[${new Date().toISOString()}] [PM] ${message}`;
        if (this.logStream) this.logStream.write(line + "\n");
        console.log(line);
    }

    private writeChildLog(stream: "out" | "err", output: string): void {
        if (!this.logStream) return;
        const stamp = new Date().toISOString();
        for (const line of output.split("\n")) {
            if (line.length) this.logStream.write(`[${stamp}] [bot:${stream}] ${line}\n`);
        }
    }
}

if (require.main === module) {
    const version = (() => {
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
            return typeof pkg.version === "string" ? pkg.version : "0.0.0";
        } catch {
            return "0.0.0";
        }
    })();

    console.log("");
    try {
        console.log(cyan(figlet.textSync("BarnieBot", { font: "Standard" })));
    } catch {
        console.log(cyan("BarnieBot"));
    }
    console.log(cyan(`Process Manager v${version}`));
    console.log("═".repeat(50));

    const manager = new ProcessManager({
        script: path.join(__dirname, "index.ts"),
        autoRestart: true,
        maxRestarts: 50,
        restartDelay: 3000,
        logFile: path.join(__dirname, "logs", "process-manager.log")
    });

    console.log(green("✓") + " Auto-restart enabled");
    console.log(green("✓") + " Crash detection active");
    console.log(green("✓") + " Monitoring for fatal errors");
    console.log(green("✓") + ` Maximum restarts: ${manager.maxRestarts}`);
    console.log("");
    if (process.stdin.isTTY) console.log(`${dim("[PM]")} Press ${cyan("t")} for status | ${cyan("r")} restart | ${cyan("s")} shutdown | ${cyan("q")} quit`);

    manager.start();
    manager.startConsole();
}
