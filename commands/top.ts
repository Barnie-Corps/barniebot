import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("top")
        .setDescription("Shows global leaderboards")
        .addStringOption(o =>
            o.setName("metric")
                .setDescription("Leaderboard metric")
                .setRequired(false)
                .addChoices(
                    { name: "Messages", value: "messages" },
                    { name: "Command executions", value: "commands" }
                )
        )
        .addIntegerOption(o =>
            o.setName("limit")
                .setDescription("How many to show (5-25)")
                .setMinValue(5)
                .setMaxValue(25)
        ),
    category: "Info",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        const limit = interaction.options.getInteger("limit") ?? 10;
        const metric = interaction.options.getString("metric") ?? "messages";
        const resolvedLimit = Math.max(5, Math.min(25, limit));
        let texts = {
            embed: {
                title_messages: "Top message leaderboard",
                title_commands: "Top command leaderboard",
                description_messages: "Global ranking by tracked messages.",
                description_commands: "Global ranking by slash command usage.",
                footer: "Global leaderboard"
            },
            fields: {
                messages: "Messages",
                commands: "Commands",
                your_rank: "Your rank",
                total_tracked: "Tracked users"
            },
            common: {
                unknown_user: "Unknown User",
                none: "Unranked"
            },
            errors: {
                no_data: "There is no data to show"
            }
        };
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }

        const sql = metric === "commands"
            ? "SELECT id AS uid, username, command_executions AS value FROM discord_users ORDER BY command_executions DESC, username ASC LIMIT ?"
            : "SELECT mc.uid AS uid, du.username AS username, mc.count AS value FROM message_count mc LEFT JOIN discord_users du ON du.id = mc.uid ORDER BY mc.count DESC, mc.uid ASC LIMIT ?";
        const rankSql = metric === "commands"
            ? "SELECT COUNT(*) + 1 AS rank FROM discord_users WHERE command_executions > (SELECT command_executions FROM discord_users WHERE id = ? LIMIT 1)"
            : "SELECT COUNT(*) + 1 AS rank FROM message_count WHERE count > (SELECT count FROM message_count WHERE uid = ? LIMIT 1)";
        const totalSql = metric === "commands"
            ? "SELECT COUNT(*) AS total FROM discord_users WHERE command_executions > 0"
            : "SELECT COUNT(*) AS total FROM message_count";

        const rows = await db.query(sql, [resolvedLimit]) as unknown as Array<{ uid: string; username?: string; value: number }>;
        if (rows.length === 0) return await utils.safeInteractionRespond(interaction, { content: texts.errors.no_data });

        const totalRows = await db.query(totalSql) as unknown as Array<{ total: number }>;
        const selfBaseRows = await db.query(metric === "commands" ? "SELECT command_executions AS value FROM discord_users WHERE id = ? LIMIT 1" : "SELECT count AS value FROM message_count WHERE uid = ? LIMIT 1", [interaction.user.id]) as unknown as Array<{ value: number }>;
        const selfRankRows = selfBaseRows[0] ? await db.query(rankSql, [interaction.user.id]) as unknown as Array<{ rank: number }> : [];
        const selfRankText = selfRankRows[0]?.rank ? `#${selfRankRows[0].rank}` : texts.common.none;
        const valueLabel = metric === "commands" ? texts.fields.commands : texts.fields.messages;
        const title = metric === "commands" ? texts.embed.title_commands : texts.embed.title_messages;
        const description = metric === "commands" ? texts.embed.description_commands : texts.embed.description_messages;
        const medals = ["🥇", "🥈", "🥉"];
        const nf = new Intl.NumberFormat();

        const embed = new EmbedBuilder()
            .setColor("Blue")
            .setTitle(`${title} • Top ${rows.length}`)
            .setDescription(description)
            .setFooter({
                text: `${texts.embed.footer} • ${texts.fields.total_tracked}: ${totalRows[0]?.total ?? rows.length} • ${texts.fields.your_rank}: ${selfRankText}`,
                iconURL: interaction.client.user?.displayAvatarURL()
            });

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            let user: any = interaction.client.users.cache.get(row.uid);
            if (!user) user = await interaction.client.users.fetch(row.uid).catch(() => null);
            const place = i < 3 ? medals[i] : `#${i + 1}`;
            const baseName = user ? `${user.displayName} (@${user.username})` : (row.username ? `${row.username}` : texts.common.unknown_user);
            embed.addFields({
                name: `${place} • ${baseName}`,
                value: `${valueLabel}: ${nf.format(Number(row.value ?? 0))}\nID: ${row.uid}`,
                inline: false
            });
        }

        await utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
    }
};
