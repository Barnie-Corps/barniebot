import * as Color from "colors";
Color.enable();
import client from "..";
import data from "../data";
import { TextChannel } from "discord.js";
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
        if (sources.length < 1) this.warn("log-manager", "There are no sources given to the constructor, only the following sources will be accepted: log-manager, unknown");
    }
    error(source: string, message: string, send?: boolean): void {
        if (typeof source !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof source}`);
        if (typeof message !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof message}`);
        if (!this.sources.some(s => s.toLowerCase() === source.toLowerCase())) throw new RangeError("Unknown source");
        console.log(`[${source.toUpperCase()}][ERROR]: ${message}`.red);
        if (send) this.send(data.bot.log_channel, `[${source.toUpperCase()}][ERROR]: ${message}`);
    }
    info(source: string, message: string, send?: boolean): void {
        if (typeof source !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof source}`);
        if (typeof message !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof message}`);
        if (!this.sources.some(s => s.toLowerCase() === source.toLowerCase())) throw new RangeError("Unknown source");
        console.log(`[${source.toUpperCase()}][INFO]: ${message}`.gray);
        if (send) this.send(data.bot.log_channel, `[${source.toUpperCase()}][INFO]: ${message}`);
    }
    success(source: string, message: string, send?: boolean): void {
        if (typeof source !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof source}`);
        if (typeof message !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof message}`);
        if (!this.sources.some(s => s.toLowerCase() === source.toLowerCase())) throw new RangeError("Unknown source");
        console.log(`[${source.toUpperCase()}][SUCCESS]: ${message}`.green);
        if (send) this.send(data.bot.log_channel, `[${source.toUpperCase()}][SUCCESS]: ${message}`);
    }
    warn(source: string, message: string, send?: boolean): void {
        if (typeof source !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof source}`);
        if (typeof message !== "string") throw new TypeError(`Source parameter must be of type string, received ${typeof message}`);
        if (!this.sources.some(s => s.toLowerCase() === source.toLowerCase())) throw new RangeError("Unknown source");
        console.log(`[${source.toUpperCase()}][WARNING]: ${message}`.yellow);
        if (send) this.send(data.bot.log_channel, `[${source.toUpperCase()}][WARNING]: ${message}`);
    }
    private async send(channelId: string, message: string): Promise<void> {
        const channel = client.channels.cache.get(channelId);
        if (!channel) throw new TypeError(`Invalid channel provided.`);
        await (channel as TextChannel).send(message);
    }
}
export default LogManager;