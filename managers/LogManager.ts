import * as Color from "colors";
Color.enable();
class LogManager {
    public sources: string[];
    constructor(sources: string[] = []) {
        /**
         * @type {string[]}
         */
        this.sources = sources;
        if (!sources.includes("log-manager")) this.sources.push("log-manager");
        if (!sources.includes("unknown")) this.sources.push("unknown");
        if (!sources.includes("system")) this.sources.push("system");
        if (sources.length < 1) this.warn("log-manager", "There are no sources passed to the constructor, only the following sources will be accepted: log-manager, unknown");
    }
    error(source: string, message: string): void {
        if (typeof source !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof source}`);
        if (typeof message !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof message}`);
        if (!this.sources.some(s => s.toLowerCase() === source.toLowerCase())) throw new RangeError("Unknown source");
        return console.log(`[${source.toUpperCase()}][ERROR]: ${message}`.red);
    }
    info(source: string, message: string): void {
        if (typeof source !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof source}`);
        if (typeof message !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof message}`);
        if (!this.sources.some(s => s.toLowerCase() === source.toLowerCase())) throw new RangeError("Unknown source");
        return console.log(`[${source.toUpperCase()}][INFO]: ${message}`.gray);
    }
    success(source: string, message: string): void {
        if (typeof source !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof source}`);
        if (typeof message !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof message}`);
        if (!this.sources.some(s => s.toLowerCase() === source.toLowerCase())) throw new RangeError("Unknown source");
        return console.log(`[${source.toUpperCase()}][SUCCESS]: ${message}`.green);
    }
    warn(source: string, message: string): void {
        if (typeof source !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof source}`);
        if (typeof message !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof message}`);
        if (!this.sources.some(s => s.toLowerCase() === source.toLowerCase())) throw new RangeError("Unknown source");
        return console.log(`[${source.toUpperCase()}][WARN]: ${message}`.yellow);
    }
}
export default LogManager;