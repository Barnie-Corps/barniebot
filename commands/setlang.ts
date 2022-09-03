import { Message } from "discord.js";
import { ReplyFunction } from "../types/interfaces";
import * as langs from "langs";
import utils from "../utils";
import db from "../mysql/database";

export default {
    data: {
        name: "setlang",
        aliases: ["setlanguage"],
        description: "Establece el idioma en que quieres que el bot te responda proporcionando el código ISO 639-1.",
        guildOnly: false,
        requiredGuildPermissions: [],
        category: "config"
    },
    execute: async (message: Message, args: string[], reply: ReplyFunction, prefix: string, lang: string) => {
        let newLang = args[0];
        if (!newLang) return reply("```\n" + `${prefix}setlang <language>\n${utils.createSpaces(`${prefix}setlang <`.length)}${utils.createArrows("language".length)}\n\nERR: Missing required argument.` + "\n```");
        newLang = newLang.toLowerCase();
        if (newLang === lang) return reply("```\n" + `${prefix}setlang ${newLang}\n${utils.createSpaces(`${prefix}setlang `.length)}${utils.createArrows(newLang.length)}\n\nERR: Cannot set same language twice.` + "\n```");
        if (newLang.length > 2) return reply("```\n" + `${prefix}setlang ${newLang}\n${utils.createSpaces(`${prefix}setlang `.length)}${utils.createArrows(newLang.length)}\n\nERR: Language code cannot have more than 2 characters.` + "\n```");
        if (!langs.has(1, newLang) || newLang === "br") return reply("```\n" + `${prefix}setlang ${newLang}\n${utils.createSpaces(`${prefix}setlang `.length)}${utils.createArrows(newLang.length)}\n\nERR: Invalid language code.` + "\n```");
        const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [message.author.id]) as unknown) as any[]);
        if (foundLang[0]) {
            await db.query("UPDATE languages SET ? WHERE userid = ?", [{ lang: newLang }, message.author.id]);
        }
        else {
            await db.query("INSERT INTO languages SET ?", [{ userid: message.author.id, lang: newLang }]);
        }
        await reply(newLang === "es" ? `Idioma establecido correctamente a **${langs.where("1", newLang)?.local}**` : (await utils.translate(`Idioma establecido correctamente a **${langs.where("1", newLang)?.local}**`, "es", newLang)).text);
    }
}