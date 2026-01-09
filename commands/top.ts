import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import type { MessageCount } from "../types/interfaces";

export default {
    data: new SlashCommandBuilder()
        .setName("top")
        .setDescription("Shows the top users in the message count leaderboard")
        .addIntegerOption(o => o.setName("limit").setDescription("How many to show (5-25)").setMinValue(5).setMaxValue(25)),
    category: "Info",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        const limit = interaction.options.getInteger("limit") ?? 10;
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
        const rows = await db.query("SELECT * FROM message_count ORDER BY count DESC LIMIT ?", [Math.max(5, Math.min(25, limit))]) as unknown as MessageCount[];
        if (rows.length === 0) return await utils.safeInteractionRespond(interaction, { content: texts.errors.no_data });

        const embed = new EmbedBuilder({
            title: texts.embed.title.replace("Top 10", `Top ${rows.length}`),
            description: texts.embed.description,
            footer: {
                text: texts.embed.footer,
                iconURL: interaction.client.user?.displayAvatarURL()
            },
            fields: []
        })
            .setColor("Purple");

        const medals = ["🥇", "🥈", "🥉"]; // for top 3
        const nf = new Intl.NumberFormat();

        // Resolve users (fetch if missing) to improve display names
        for (let i = 0; i < rows.length; i++) {
            const d = rows[i];
            let user = interaction.client.users.cache.get(d.uid!);
            if (!user) {
                try { user = await interaction.client.users.fetch(d.uid!); } catch {}
            }
            const place = i < 3 ? medals[i] : `#${i + 1}`;
            const display = user ? `${user.displayName} (@${user.username})` : `Unknown User`;
            (embed.data.fields as any[]).push({
                name: `${place} • ${display} (${d.uid})`,
                value: `${texts.fields.normal}: ${nf.format(d.count)}`
            });
        }

        await utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
    }
}