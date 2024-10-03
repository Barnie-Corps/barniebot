import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import data from "../data";

export default {
    data: new SlashCommandBuilder()
        .setName("top")
        .setDescription("Shows the top users in the message count leaderboard"),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            embed: {
                title: "Top 10 message count leaderboard",
                description: "Here you can see the top 10 users in the message count leaderboard",
                footer: "Santiago Morales © 2020 - 2025 All rights reserved. Messages are not stored unless they are global messages.",
            },
            fields: {
                normal: "Normal messages",
            },
            errors: {
                no_data: "There is no data to show"
            }
        }
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        const data: any = await db.query("SELECT * FROM message_count ORDER BY count DESC LIMIT 10");
        if (data.length === 0) return await interaction.editReply(texts.errors.no_data);
        const embed = new EmbedBuilder({
            title: texts.embed.title,
            description: texts.embed.description,
            footer: {
                text: texts.embed.footer,
                iconURL: interaction.client.user?.displayAvatarURL()
            },
            fields: data.map((d: any, i: number) => {
                const user = interaction.client.users.cache.get(d.uid);
                return {
                    name: `#${i + 1} - ${user ? `${user?.displayName} (@${user?.username})` : `Unknown User`} (${d.uid})`,
                    value: `${texts.fields.normal}: ${d.count}`
                }
            }),
        })
        .setColor("Purple");
        await interaction.editReply({ embeds: [embed], content: "" });
    }
}