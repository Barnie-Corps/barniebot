import { ChatInputCommandInteraction, Collection, Message, SlashCommandBuilder } from "discord.js"
import langs from "langs";
import utils from "../utils";
import db from "../mysql/database";

export default {
    data: new SlashCommandBuilder()
        .setName("setlang")
        .setDescription("Sets your language")
        .addStringOption(o => o.setName("language").setDescription("New language's code").setRequired(true)),
    category: "Utility",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let newLang = interaction.options.getString("language");
        const respond = async (text: string) => utils.safeInteractionRespond(interaction, { content: text, ephemeral: true });
        if (!newLang) return respond("```\n" + `/setlang <language>\n${utils.createSpaces(`/setlang <`.length)}${utils.createArrows("language".length)}\n\nERR: Missing required argument.` + "\n```");
        newLang = newLang.toLowerCase();
        if (newLang === lang) return respond("```\n" + `/setlang ${newLang}\n${utils.createSpaces(`/setlang `.length)}${utils.createArrows(newLang.length)}\n\nERR: Cannot set same language twice.` + "\n```");
        if (newLang.length > 2) return respond("```\n" + `/setlang ${newLang}\n${utils.createSpaces(`/setlang `.length)}${utils.createArrows(newLang.length)}\n\nERR: Language code cannot have more than 2 characters.` + "\n```");
        if (!langs.has(1, newLang) || ["ch", "br", "wa"].some(v => newLang === v)) return respond("```\n" + `/setlang ${newLang}\n${utils.createSpaces(`/setlang `.length)}${utils.createArrows(newLang.length)}\n\nERR: Invalid language code.` + "\n```");
        const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [interaction.user.id]) as unknown) as any[]);
        if (foundLang[0]) {
            await db.query("UPDATE languages SET ? WHERE userid = ?", [{ lang: newLang }, interaction.user.id]);
        }
        else {
            await db.query("INSERT INTO languages SET ?", [{ userid: interaction.user.id, lang: newLang }]);
        }
        const confirmationMessage = `Language set successfully to **${langs.where("1", newLang)?.local}**\n\nRemember: BarnieBot stores public information from your profile such as your Discord ID, username, profile picture, etc. We do not store your messages!`;
        await respond(newLang === "en" ? confirmationMessage : (await utils.translate(confirmationMessage, "en", newLang)).text);
    },
    ephemeral: true
}