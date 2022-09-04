import { Client, Message, TextChannel } from "discord.js";
import EventEmitter from "events";
import Log from "../Log";
import db from "../mysql/database";

export default class ChatManager extends EventEmitter {
    constructor (private client: Client<true>) {
        super();
        if (!client || !(client instanceof Client<true>)) throw new Error("A valid client was not provided to ChatManager constructor.");
        this.client.on("messageCreate", async (message): Promise<any> => {
            if (!message.guild) return;
            const foundChannel = ((await db.query("SELECT * FROM global_chats WHERE channel = ? AND guild = ?", [message.channel.id, message.guild?.id]) as unknown) as any[]);
            if (foundChannel[0]) this.emit("message", message);
        });
    }
    async broadcast(exceptId: string, messageObject: any, originalMessage: Message<true>) {
        const channels = ((await db.query("SELECT * FROM global_chats") as unknown) as any[]);
        for (const channel of channels) {
            if (channel.channel === exceptId || !channel.active) continue;
            else {
                if (!this.client.channels.cache.has(channel.channel)) continue;
                await this.send(channel.channel, messageObject, originalMessage);
            }
        }
    }
    async send(channelId: string, messageObject: any, originalMessage: Message<true>) {}
}