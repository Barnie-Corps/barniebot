import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("github")
        .setDescription("Provides info about the BarnieBot's GitHub repository"),
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let message = "🔧 **BarnieBot GitHub Repository**\n\n" +
            "Check out the source code and contribute to the project:\n\n" +
            "📦 **Repository**: https://github.com/Barnie-Corps/barniebot\n" +
            "💬 **Optional Message**: https://github.com/Barnie-Corps/barniebot/blob/master/based.txt\n\n" +
            "Feel free to star ⭐ the repo if you find it useful!";

        if (lang !== "en") {
            message = (await utils.translate(message, "en", lang)).text;
        }
        await interaction.editReply(message);
        const msg = await interaction.fetchReply();
        await msg.suppressEmbeds(true);
    },
    ephemeral: false
}