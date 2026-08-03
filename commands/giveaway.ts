import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";

export default {
    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Manage giveaways")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s =>
            s.setName("start")
                .setDescription("Start a new giveaway")
                .addStringOption(o => o.setName("prize").setDescription("The prize to give away").setRequired(true))
                .addStringOption(o => o.setName("duration").setDescription("Duration (e.g. 30m, 2h, 1d)").setRequired(true))
                .addIntegerOption(o => o.setName("winners").setDescription("Number of winners (default 1)").setMinValue(1).setMaxValue(25))
                .addStringOption(o => o.setName("description").setDescription("Description of the giveaway"))
        )
        .addSubcommand(s =>
            s.setName("end")
                .setDescription("End a giveaway early")
                .addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true))
        )
        .addSubcommand(s =>
            s.setName("reroll")
                .setDescription("Reroll a giveaway winner")
                .addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true))
        )
        .addSubcommand(s =>
            s.setName("list")
                .setDescription("List active giveaways in this server")
        ),
    category: "Utility",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let texts = {
            no_guild: "This command can only be used in a server.",
            invalid_time: "Invalid duration. Use e.g. `30m`, `2h`, `1d`.",
            time_too_short: "Minimum duration is 1 minute.",
            time_too_long: "Maximum duration is 30 days.",
            giveaway_started: "🎉 Giveaway started!",
            prize: "Prize",
            ends: "Ends",
            winners: "Winner(s)",
            enter: "🎉 Enter Giveaway",
            entered: "You entered the giveaway!",
            already_entered: "You're already entered!",
            no_perms: "You don't have permission to manage giveaways.",
            not_found: "Giveaway not found.",
            ended: "Giveaway ended.",
            no_entries: "No entries, couldn't pick a winner.",
            winner: "Winner",
            rerolled: "Winner rerolled!",
            new_winner: "New winner",
            active_giveaways: "Active Giveaways",
            none_active: "No active giveaways in this server.",
            ended_announcement: "🎊 Giveaway Ended!",
            hoster: "Hosted by"
        };
        if (lang !== "en") {
            try { texts = await utils.autoTranslate(texts, "en", lang); } catch {}
        }
        if (!interaction.guildId) {
            return utils.safeInteractionRespond(interaction, { content: texts.no_guild, ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const respond = (payload: any) => utils.safeInteractionRespond(interaction, { ...payload, ephemeral: true });
        if (sub === "start") {
            const prize = interaction.options.getString("prize", true);
            const durationStr = interaction.options.getString("duration", true);
            const winnerCount = interaction.options.getInteger("winners") ?? 1;
            const description = interaction.options.getString("description") ?? undefined;
            const ms = parseDuration(durationStr);
            if (!ms || ms < 60000) return respond({ content: texts.invalid_time + (ms && ms < 60000 ? " " + texts.time_too_short : "") });
            if (ms > 2592000000) return respond({ content: texts.time_too_long });
            const endsAt = Date.now() + ms;
            const result = await db.query("INSERT INTO giveaways SET ?", [{
                guild_id: guildId,
                channel_id: interaction.channelId,
                prize, description: description || null,
                winner_count: winnerCount,
                ends_at: endsAt,
                created_by: interaction.user.id,
                created_at: Date.now()
            }]) as any;
            const giveawayId = result.insertId;
            const embed = new EmbedBuilder()
                .setColor("Gold")
                .setTitle(`🎉 ${prize}`)
                .setDescription(description || "")
                .addFields(
                    { name: texts.prize, value: prize, inline: true },
                    { name: texts.winners, value: String(winnerCount), inline: true },
                    { name: texts.ends, value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
                    { name: texts.hoster, value: `<@${interaction.user.id}>`, inline: true }
                )
                .setFooter({ text: `ID: ${giveawayId}` })
                .setTimestamp();
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway_enter_${giveawayId}`)
                    .setLabel(texts.enter)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji("🎉")
            );
            const msg = await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });
            await db.query("UPDATE giveaways SET message_id = ? WHERE id = ?", [msg.id, giveawayId]);
            return respond({ content: texts.giveaway_started });
        }
        if (sub === "end") {
            const id = interaction.options.getString("id", true);
            const rows = await db.query("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?", [id, guildId]) as unknown as any[];
            if (!rows[0]) return respond({ content: texts.not_found });
            await endGiveaway(rows[0], texts);
            return respond({ content: texts.ended });
        }
        if (sub === "reroll") {
            const id = interaction.options.getString("id", true);
            const rows = await db.query("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?", [id, guildId]) as unknown as any[];
            if (!rows[0]) return respond({ content: texts.not_found });
            const giveaway = rows[0];
            const entries = await db.query("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?", [id]) as unknown as any[];
            const userIds = entries.map((e: any) => e.user_id);
            let excluded: string[] = giveaway.winner_ids || [];
            if (typeof excluded === "string") {
                try { excluded = JSON.parse(excluded); } catch { excluded = []; }
            }
            const eligible = userIds.filter((uid: string) => !excluded.includes(uid));
            if (eligible.length === 0) return respond({ content: texts.no_entries });
            const newWinner = eligible[Math.floor(Math.random() * eligible.length)];
            await db.query("UPDATE giveaways SET winner_ids = JSON_ARRAY_APPEND(IFNULL(winner_ids, '[]'), '$', ?) WHERE id = ?", [newWinner, id]);
            const channel = await interaction.client.channels.fetch(giveaway.channel_id).catch(() => null) as TextChannel | null;
            if (channel) {
                await channel.send(`🎉 **${texts.rerolled}** ${texts.new_winner}: <@${newWinner}>! ${giveaway.prize}`);
            }
            return respond({ content: `${texts.new_winner}: <@${newWinner}>` });
        }
        if (sub === "list") {
            const rows = await db.query("SELECT * FROM giveaways WHERE guild_id = ? AND ended = FALSE ORDER BY ends_at ASC", [guildId]) as unknown as any[];
            if (!rows[0]) return respond({ content: texts.none_active });
            const list = rows.map((g: any) => `**#${g.id}** - ${g.prize} - ${texts.ends} <t:${Math.floor(g.ends_at / 1000)}:R>`).join("\n");
            const embed = new EmbedBuilder()
                .setColor("Gold")
                .setTitle(texts.active_giveaways)
                .setDescription(list)
                .setTimestamp();
            return respond({ embeds: [embed] });
        }
    },
    ephemeral: true
};

async function endGiveaway(giveaway: any, texts: any) {
    const entries = await db.query("SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?", [giveaway.id]) as unknown as any[];
    const userIds = entries.map((e: any) => e.user_id);
    const winners: string[] = [];
    const pool = [...userIds];
    for (let i = 0; i < giveaway.winner_count && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool[idx]);
        pool.splice(idx, 1);
    }
    await db.query("UPDATE giveaways SET ended = TRUE, winner_ids = ? WHERE id = ?", [JSON.stringify(winners), giveaway.id]);
    const channel = await (global as any).client?.channels.fetch(giveaway.channel_id).catch(() => null) as TextChannel | null;
    if (!channel) return;
    const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle(`🎊 ${giveaway.prize}`)
        .setDescription(giveaway.description || "")
        .addFields(
            { name: texts.winner, value: winners.length > 0 ? winners.map((w: string) => `<@${w}>`).join(", ") : texts.no_entries, inline: true },
            { name: texts.hoster, value: `<@${giveaway.created_by}>`, inline: true }
        )
        .setTimestamp();
    await channel.send({ content: winners.length > 0 ? `🎉 ${texts.ended_announcement}! ${winners.map((w: string) => `<@${w}>`).join(", ")} won **${giveaway.prize}**!` : undefined, embeds: [embed] });
    const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
    if (msg) {
        await msg.edit({ components: [] });
    }
}

function parseDuration(str: string): number | null {
    if (!/^\d+[smhd]$/.test(str)) return null;
    const val = parseInt(str);
    const unit = str.slice(-1);
    switch (unit) {
        case "s": return val * 1000;
        case "m": return val * 60000;
        case "h": return val * 3600000;
        case "d": return val * 86400000;
        default: return null;
    }
}
