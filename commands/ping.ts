import { Message } from "discord.js";
import { ReplyFunction } from "../types/interfaces";

export default {
    data: {
        name: "ping",
        description: "Muestra el tiempo de respuesta del bot",
        guildOnly: false,
        requiredGuildPermissions: [],
        aliases: ["latency"],
        category: "info"
    },
    execute: async (message: Message, args: string[], reply: ReplyFunction, prefix: string, lang: string) => {
        reply(`HTTP API: ----//----\nAPI Heartbeat: ${message.client.ws.ping} ms`).then(m => {
            m.edit(`HTTP API: ${m.createdTimestamp - message.createdTimestamp} ms\nAPI Heartbeat: ${message.client.ws.ping} ms`);
        });
    }
}