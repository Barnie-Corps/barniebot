import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Shows bot's latency"),
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let texts = {
            socket: "Socket latency",
            http: "HTTP API latency"
        }
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        const start = Date.now();
        await interaction.editReply(`:ping_pong: Pong!\n${texts.socket}: ${interaction.client.ws.ping} ms\n${texts.http}: --//--`);
        const end = Date.now();
        const wsPing = interaction.client.ws.ping;
        await interaction.editReply(`:ping_pong: Pong!\n${texts.socket}: ${wsPing} ms (${wsPing / 1000} s)\n${texts.http}: ${end - start} ms (${(end - start) / 1000} s)`);
    },
    ephemeral: false
}