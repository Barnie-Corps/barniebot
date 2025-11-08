import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import utils from "../utils";
import Workers from "../Workers";

export default {
    data: new SlashCommandBuilder()
        .setName("workers")
        .setDescription("Shows worker pool stats and latencies"),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        const stats = Workers.getWorkerStats();
        let texts = {
            title: "Worker Pools",
            description: "Real-time statistics for active worker pools.",
            fieldHeader: "Type",
            totals: "Totals",
            totalWorkers: "Total workers",
            latency: {
                avg: "Avg ping",
                last: "Last ping"
            },
            counts: {
                available: "Available",
                running: "Running"
            },
            noData: "No workers available",
            footer: "Latency values are moving averages; keep-alive pings maintain warm state."
        };

        if (lang !== "en") {
            try { texts = await utils.autoTranslateParallel(texts, "en", lang); } catch { /* ignore translation errors */ }
        }

        const embed = new EmbedBuilder()
            .setTitle(texts.title)
            .setDescription(texts.description)
            .setColor("Purple");

        const types = Object.entries(stats.byType);
        if (types.length === 0) {
            embed.addFields({ name: texts.noData, value: "\u200b" });
        } else {
            for (const [type, info] of types) {
                const lines: string[] = [];
                lines.push(`${texts.counts.available}: ${info.available}`);
                lines.push(`${texts.counts.running}: ${info.running}`);
                if (typeof info.avgPingMs === "number") lines.push(`${texts.latency.avg}: ${info.avgPingMs} ms`);
                if (typeof info.lastPingMs === "number") lines.push(`${texts.latency.last}: ${info.lastPingMs} ms`);
                embed.addFields({ name: `${texts.fieldHeader}: ${type}`, value: lines.join("\n"), inline: true });
            }
        }

        embed.addFields({ name: texts.totals, value: `${texts.totalWorkers}: ${stats.total}` });
        embed.setFooter({ text: texts.footer });
        await interaction.editReply({ embeds: [embed], content: null });
    },
    ephemeral: false
};
