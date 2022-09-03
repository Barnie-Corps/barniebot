import { Message, PermissionsBitField } from "discord.js";
import db from "../mysql/database";
import { ReplyFunction } from "../types/interfaces";
import utils from "../utils";
export default {
    data: {
        name: "setprefix",
        aliases: [],
        description: "Establece el prefijo del bot.",
        guildOnly: true,
        requiredGuildPermissions: ["ManageGuild"],
        category: "config"
    },
    execute: async (message: Message, args: string[], reply: ReplyFunction, prefix: string, lang: string) => {
        let newPrefix = args[0];
        if (!newPrefix) return reply("```\n" + `${prefix}setprefix <prefix>\n${utils.createSpaces(`${prefix}setprefix <`.length)}${utils.createArrows("prefix".length)}\n\nERR: Missing required argument.` + "\n```");
        newPrefix = newPrefix.toLowerCase();
        if (newPrefix.length > 4) return reply("```\n" + `${prefix}setprefix ${newPrefix}\n${utils.createSpaces(`${prefix}setprefic `.length)}${utils.createArrows(newPrefix.length)}\n\nERR: The new prefix cannot have more than 4 characters.` + "\n```");
        if (newPrefix === prefix) return reply("```\n" + `${prefix}setprefix ${newPrefix}\n${utils.createSpaces(`${prefix}setprefix `.length)}${utils.createArrows(newPrefix.length)}\n\nERR: Cannot set same prefix twice.` + "\n```");
        const foundPrefix = ((await db.query("SELECT * FROM prefixes WHERE guild = ?", [message.guild?.id]) as unknown) as any[]);
        if (foundPrefix[0]) {
            await db.query("UPDATE prefixes SET ? WHERE guild = ?", [{ changedAt: Math.round(Date.now() / 1000), changedBy: message.author.id, lastPrefix: prefix, prefix: newPrefix }, message.guild?.id]);
        }
        else {
            await db.query("INSERT INTO prefixes SET ?", [{ guild: message.guild?.id, prefix: newPrefix, lastPrefix: prefix, changedAt: Math.round(Date.now() / 1000), changedBy: message.author.id }]);
        }
        await reply(lang === "es" ? `Prefijo establecido correctamente a **${newPrefix}**.` : (await utils.translate(`Prefijo establecido correctamente a **${newPrefix}**.`, "es", lang)).text);
        message.guild?.members.me?.setNickname(`[${newPrefix}] BarnieBot`);
    }
}