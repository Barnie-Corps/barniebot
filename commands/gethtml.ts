import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import * as fs from "fs";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("gethtml")
        .setDescription("Gets the HTML and code response from a given URL.")
        .addStringOption(o => o.setName("url").setRequired(true).setDescription("URL whose response code and html you wanna get")),
    execute: async (interaction: ChatInputCommandInteraction, language: string) => {
        let texts = {
            code: "Código de respuesta",
            invalid: "Ooops... Comprueba nuevamente la URL que me diste :)"
        }
        if (language !== "es") {
            texts = await utils.autoTranslate(texts, "es", language);
        }
        const url = interaction.options.getString("url") as string;
        let response;
        try {
            response = await fetch(url);
        }
        catch (err: any) {
            interaction.editReply(texts.invalid);
            return;
        }
        if (!response) return;
        const html = await response.text();
        const code = response.status;
        fs.writeFileSync("../response.html", (html as any).replaceAll(String(process.env.SYSTEM_IP), "[SYSTEM IP CENSORED]"));
        await interaction.editReply({ content: `${texts.code}: ${code}\nHTML:`, files: ["../response.html"] });
        fs.unlinkSync("../response.html");
    }
}