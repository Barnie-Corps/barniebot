import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import fetch from "node-fetch";
import data from "../data";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("meme")
        .setDescription("Shows a random meme"),
    category: "Fun",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let texts = {
            viewPost: "View post"
        };
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang).catch(() => texts);
        }
        async function getMeme() {
            for (let attempt = 0; attempt < 5; attempt++) {
                const rsp = await fetch("https://meme-api.com/gimme");
                if (!rsp.ok) throw new Error(`Meme API responded with ${rsp.status}`);
                const json: any = await rsp.json();
                if (!json.nsfw) return json;
            }
            throw new Error("Could not find a safe meme");
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
                    .setLabel(texts.viewPost)
                    .setURL(meme.postLink)
            )
        const embed = new EmbedBuilder()
            .setTitle(`${meme.title}`)
            .setImage(meme.url)
            .setColor("Purple")
            .setTimestamp()
            .setFooter({ text: `${data.bot.emojis[0].emoji} ${meme.ups}` })
        await utils.safeInteractionRespond(interaction, { embeds: [embed], components: [row as any], content: "" });
    },
    ephemeral: false
}