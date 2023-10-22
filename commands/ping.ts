import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Shows bot's latency"),
    async execute (interaction: ChatInputCommandInteraction, lang: string) {
        await interaction.deferReply();
        const start = Date.now();
        await interaction.editReply(`:ping_pong: Pong!\nSocket latency: ${interaction.client.ws.ping} ms\nHTTP API latency: --//--`);
        const end = Date.now();
        const wsPing = interaction.client.ws.ping;
        await interaction.editReply(`:ping_pong: Pong!\nSocket latency: ${wsPing} ms (${wsPing / 1000} s)\nHTTP API latency: ${end - start} ms (${(end - start) / 1000} s)`);
    }
}