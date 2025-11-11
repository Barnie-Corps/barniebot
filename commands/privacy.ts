import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("privacy")
        .setDescription("Shows you the bot privacy policy."),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let text = { value: "Here is the bot's privacy policy, I recommend reading it." };
        if (lang !== "en") {
            text = (await utils.autoTranslate(text, "en", lang));
        }
        await interaction.editReply(`${text.value}\n[Privacy policy](https://github.com/Barnie-Corps/barniebot/blob/master/privacy.md)`);
    },
    ephemeral: false
}