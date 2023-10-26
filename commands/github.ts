import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("github")
        .setDescription("Provides info about the BarnieBot's GitHub repository"),
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let message: string = "¿Te interesa utilizar el código de BarnieBot completamente gratis y actualizado siempre? Tú tranquil@, yo te cubro :wink:.\nAntes de darte el link, te pido encarecidamente que leas con atención la licencia a la que está sujeta mi código y des el respectivo crédito a mi creador :). A continuación, te dejaré los links del repositorio y del archivo que contiene un mensaje que sería bueno que incluyeras en tu código :). Están listado de manera respectiva:";
        if (lang !== "es") {
            message = (await utils.translate(message, "es", lang)).text;
        }
        await interaction.editReply(`${message.replace(": wink:", " :wink:")}\n\n- [Repo](https://github.com/Barnie-Corps/barniebot)\n- [Optional message](https://github.com/Barnie-Corps/barniebot/blob/master/based.txt)`);
        const msg = await interaction.fetchReply();
        await msg.suppressEmbeds(true);
    },
    ephemeral: false
}