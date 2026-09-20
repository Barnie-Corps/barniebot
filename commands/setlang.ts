import { ChatInputCommandInteraction, Collection, Message, SlashCommandBuilder } from "discord.js"
import langs from "langs";
import utils from "../utils";
import db from "../mysql/database";
import type { UserLanguage } from "../types/interfaces";

export default {
    data: new SlashCommandBuilder()
        .setName("setlang")
        .setDescription("Sets your language")
        .addStringOption(o => o.setName("language").setDescription("New language's code").setRequired(true)),
    category: "Utility",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let newLang = interaction.options.getString("language");
        const translateFor = async (text: string, target: string) => {
            if (target === "en") return text;
            try {
                const result = await utils.translate(text, "en", target);
                return result?.text || text;
            } catch {
                return text;
            }
        };
        const errBox = async (commandLine: string, errText: string) => "```\n" + commandLine + "\n" + await translateFor(`ERR: ${errText}`, lang) + "\n```";
        const respond = async (text: string) => utils.safeInteractionRespond(interaction, { content: text, ephemeral: true });
        if (!newLang) return respond(await errBox(`/setlang <language>\n${utils.createSpaces(`/setlang <`.length)}${utils.createArrows("language".length)}\n`, "Missing required argument."));
        newLang = newLang.toLowerCase();
        if (newLang === lang) return respond(await errBox(`/setlang ${newLang}\n${utils.createSpaces(`/setlang `.length)}${utils.createArrows(newLang.length)}\n`, "Cannot set same language twice."));
        if (newLang.length > 2) return respond(await errBox(`/setlang ${newLang}\n${utils.createSpaces(`/setlang `.length)}${utils.createArrows(newLang.length)}\n`, "Language code cannot have more than 2 characters."));
        if (!utils.isValidLanguageCode(newLang)) return respond(await errBox(`/setlang ${newLang}\n${utils.createSpaces(`/setlang `.length)}${utils.createArrows(newLang.length)}\n`, "Invalid language code."));
        const foundLang = await db.query("SELECT * FROM languages WHERE userid = ?", [interaction.user.id]) as unknown as UserLanguage[];
        if (foundLang[0]) {
            await db.query("UPDATE languages SET ? WHERE userid = ?", [{ lang: newLang }, interaction.user.id]);
        }
        else {
            await db.query("INSERT INTO languages SET ?", [{ userid: interaction.user.id, lang: newLang }]);
        }
        utils.invalidateUserLanguageCache(interaction.user.id);
        const confirmationMessage = `Language set successfully to **${langs.where("1", newLang)?.local}**\n\nRemember: BarnieBot stores public information from your profile such as your Discord ID, username, profile picture, etc. We do not store your messages!`;
        await respond(newLang === "en" ? confirmationMessage : (await utils.translate(confirmationMessage, "en", newLang)).text);
    },
    ephemeral: true
}