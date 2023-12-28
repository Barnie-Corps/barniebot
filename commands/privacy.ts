import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
    .setName("privacy")
    .setDescription("Shows you the bot privacy policy."),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let text = { value: "A continuación te enviaré mi política de privacidad, te recomiendo que la leas." };
        if (lang !== "es") {
            text = (await utils.autoTranslate(text, "es", lang));
        }
        await interaction.editReply(`${text.value}\n[privacy.txt](https://github.com/Barnie-Corps/barniebot/blob/master/privacy.txt)`);
    },
    ephemeral: false
}