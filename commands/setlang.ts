import { ChatInputCommandInteraction, Collection, Message, SlashCommandBuilder } from "discord.js"
import langs from "langs";
import utils from "../utils";
import db from "../mysql/database";

export default {
    data: new SlashCommandBuilder()
        .setName("setlang")
        .setDescription("Sets your language")
        .addStringOption(o => o.setName("language").setDescription("New language's code").setRequired(true)),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let newLang = interaction.options.getString("language");
        const reply = (text: string) => {
            return interaction.editReply(text);
        }
        if (!newLang) return reply("```\n" + `/setlang <language>\n${utils.createSpaces(`/setlang <`.length)}${utils.createArrows("language".length)}\n\nERR: Missing required argument.` + "\n```");
        newLang = newLang.toLowerCase();
        if (newLang === lang) return reply("```\n" + `/setlang ${newLang}\n${utils.createSpaces(`/setlang `.length)}${utils.createArrows(newLang.length)}\n\nERR: Cannot set same language twice.` + "\n```");
        if (newLang.length > 2) return reply("```\n" + `/setlang ${newLang}\n${utils.createSpaces(`/setlang `.length)}${utils.createArrows(newLang.length)}\n\nERR: Language code cannot have more than 2 characters.` + "\n```");
        if (!langs.has(1, newLang) || ["ch", "br", "wa"].some(v => newLang === v)) return reply("```\n" + `/setlang ${newLang}\n${utils.createSpaces(`/setlang `.length)}${utils.createArrows(newLang.length)}\n\nERR: Invalid language code.` + "\n```");
        const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [interaction.user.id]) as unknown) as any[]);
        if (foundLang[0]) {
            await db.query("UPDATE languages SET ? WHERE userid = ?", [{ lang: newLang }, interaction.user.id]);
        }
        else {
            await db.query("INSERT INTO languages SET ?", [{ userid: interaction.user.id, lang: newLang }]);
        }
        await reply(newLang === "es" ? `Idioma establecido correctamente a **${langs.where("1", newLang)?.local}**\n\nRecuerda: BarnieBot almacena información pública de tu perfil, tal como lo es tu ID de discord, tu nombre de usuario, foto de perfil, etc. ¡Nosotros no almacenamos tus mensajes!` : (await utils.translate(`Idioma establecido correctamente a **${langs.where("1", newLang)?.local}**\n\nRecuerda: BarnieBot almacena información pública de tu perfil, tal como lo es tu ID de discord, tu nombre de usuario, foto de perfil, etc. ¡Nosotros no almacenamos tus mensajes!`, "es", newLang)).text);
    },
    ephemeral: true
}