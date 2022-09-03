import { Message } from "discord.js";
import db from "../mysql/database";
import { ReplyFunction } from "../types/interfaces";
import utils from "../utils";

export default {
    data: {
        name: "prefix",
        desription: "Muestra el prefijo actual, el prefijo anterior, la última vez que se cambió y el usuario que lo cambió.",
        guildOnly: true,
        requiredGuildPermissions: [],
        aliases: ["prefijo"],
        category: "config"
    },
    execute: async (message: Message, args: string[], reply: ReplyFunction, prefix: string, lang: string) => {
        const foundPrefix = ((await db.query("SELECT * FROM prefixes WHERE guild = ?", [message.guild?.id]) as unknown) as any[]);
        const texts = {
            lastPrefix: "Último prefijo",
            currentPrefix: "Prefijo actual",
            lastChange: "Fecha del último cambio",
            lastChangeBy: "Responsable del último cambio"
        }
        if (lang !== "es") {
            for (const [key, value] of Object.entries(texts)) {
                (texts as any)[key] = (await utils.translate(value, "es", lang)).text;
            }
        }
        if (foundPrefix[0]) {
            await message.client.users.fetch(foundPrefix[0].changedBy)
            await reply(`${texts.lastPrefix}: ${foundPrefix[0].lastPrefix}\n${texts.currentPrefix}: ${prefix}\n${texts.lastChange}: <t:${foundPrefix[0].changedAt}> (<t:${foundPrefix[0].changedAt}:R>)\n${texts.lastChangeBy}: ${message.client.users.cache.get(foundPrefix[0].changedBy)?.tag}`);
        }
        else {
            await reply(`${texts.lastPrefix}: none\n${texts.currentPrefix}: ${prefix}\n${texts.lastChange}: none\n${texts.lastChangeBy}: none`);
        }
        if (!message.guild?.members.me?.nickname || message.guild?.members.me?.nickname !== `[${prefix}] BarnieBot`) message.guild?.members.me?.setNickname(`[${prefix}] BarnieBot`);
    }
}