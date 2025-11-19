import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import fetch from "node-fetch";
import data from "../data";

export default {
    data: new SlashCommandBuilder()
        .setName("meme")
        .setDescription("Shows a random meme"),
    category: "Fun",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        async function getMeme() {
            let rsp = await fetch("https://meme-api.com/gimme");
            let json = await rsp.json();
            return new Promise(async (resolve, reject) => {
                do {
                    rsp = await fetch("https://meme-api.com/gimme");
                    json = await rsp.json();
                }
                while (json.nsfw);
                resolve(json);
            });
        }
        const meme: any = await getMeme();
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel(`/r/${meme.subreddit}`)
                    .setURL(`https://reddit.com/r/${meme.subreddit}`),
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel("View post")
                    .setURL(meme.postLink)
            )
        const embed = new EmbedBuilder()
            .setTitle(`${meme.title}`)
            .setImage(meme.url)
            .setColor("Purple")
            .setTimestamp()
            .setFooter({ text: `${data.bot.emojis[0].emoji} ${meme.ups}` })
        await interaction.editReply({ embeds: [embed], components: [row as any], content: "" });
    },
    ephemeral: false
}