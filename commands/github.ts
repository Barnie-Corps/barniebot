import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("github")
        .setDescription("Provides info about the BarnieBot's GitHub repository"),
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let message = "You can find the GitHub repository of BarnieBot at :wink:\n\n- [Repo](https://github.com/Barnie-Corps/barniebot)\n- [Optional message](https://github.com/Barnie-Corps/barniebot/blob/master/based.txt)";
        if (lang !== "en") {
            message = (await utils.translate(message, "en", lang)).text;
        }
        await interaction.editReply(`${message.replace(": wink:", " :wink:")}`);
        const msg = await interaction.fetchReply();
        await msg.suppressEmbeds(true);
    },
    ephemeral: false
}