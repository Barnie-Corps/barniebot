import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";
import data from "../data";
import client from "..";

// Command permission constraints: only Chief of Moderation+ can manage ranks; cannot promote above self; cannot assign own rank or higher

function canManageRank(executorRank: string | null, targetRank: string | null, desiredRank: string | null): { allowed: boolean; error?: string } {
    const execIndex = utils.getStaffRankIndex(executorRank);
    if (execIndex < 0) return { allowed: false, error: "You are not staff." };
    // Minimum rank to manage others: Chief of Moderation (index >= rank index of 'Chief of Moderation')
    const minIndex = utils.getStaffRankIndex("Chief of Moderation");
    if (execIndex < minIndex) return { allowed: false, error: "Insufficient rank to manage staff." };
    const targetIndex = utils.getStaffRankIndex(targetRank);
    const desiredIndex = utils.getStaffRankIndex(desiredRank);
    if (desiredRank && desiredIndex < 0) return { allowed: false, error: "Invalid desired rank." };
    // Cannot promote to rank equal or higher than executor
    if (desiredRank && desiredIndex >= execIndex) return { allowed: false, error: "Cannot assign a rank equal or higher than your own." };
    // Cannot demote/dismiss someone higher or equal
    if (targetRank && targetIndex >= execIndex) return { allowed: false, error: "Cannot modify someone of equal or higher rank." };
    return { allowed: true };
}

export default {
    data: new SlashCommandBuilder()
        .setName("staff")
        .setDescription("Manage staff ranks")
        .addSubcommand(s => s.setName("set")
            .setDescription("Set a user's staff rank")
            .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
            .addStringOption(o => o.setName("rank").setDescription("Rank to assign (blank to remove)").setRequired(true)))
        .addSubcommand(s => s.setName("info")
            .setDescription("Show a user's staff rank")
            .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
        .addSubcommand(s => s.setName("list")
            .setDescription("List staff members by rank"))
        .addSubcommand(s => s.setName("cases")
            .setDescription("Show moderation cases for a user (warnings, blacklist, mutes)")
            .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
            .addIntegerOption(o => o.setName("page").setDescription("Warnings page number").setMinValue(1).setRequired(false))),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        const sub = interaction.options.getSubcommand();
        const executorRank = await utils.getUserStaffRank(interaction.user.id);
        switch (sub) {
            case "set": {
                const user = interaction.options.getUser("user", true);
                const desiredRankRaw = interaction.options.getString("rank", true).trim();
                const desiredRank = desiredRankRaw.length ? desiredRankRaw : null;
                const targetRank = await utils.getUserStaffRank(user.id);
                const perm = canManageRank(executorRank, targetRank, desiredRank);
                if (!perm.allowed) return interaction.editReply({ content: perm.error });
                if (desiredRank) {
                    await utils.setUserStaffRank(user.id, desiredRank);
                    return interaction.editReply(`Assigned rank '${desiredRank}' to ${user.username}.`);
                } else {
                    await utils.setUserStaffRank(user.id, null);
                    return interaction.editReply(`Removed rank from ${user.username}.`);
                }
            }
            case "info": {
                const user = interaction.options.getUser("user", true);
                const rank = await utils.getUserStaffRank(user.id);
                return interaction.editReply(rank ? `${user.username} rank: ${rank}` : `${user.username} has no rank.`);
            }
            case "list": {
                const rows: any = await db.query("SELECT * FROM staff");
                if (!Array.isArray(rows) || rows.length === 0) return interaction.editReply("No staff registered.");
                const byRank: Record<string, string[]> = {};
                for (const r of rows) {
                    const rank = r.rank || "(none)";
                    byRank[rank] = byRank[rank] ?? [];
                    byRank[rank].push(r.uid);
                }
                const embed = new EmbedBuilder().setTitle("Staff Members").setColor("Purple");
                Object.entries(byRank).sort((a, b) => utils.getStaffRankIndex(b[0]) - utils.getStaffRankIndex(a[0])).forEach(([rank, ids]) => {
                    embed.addFields({ name: rank, value: ids.map(id => `<@${id}> (@${client.users.cache.get(id)?.username ?? "Unknown"})`).join(" ") || "(none)", inline: false });
                });
                return interaction.editReply({ embeds: [embed], content: null });
            }
            case "cases": {
                const user = interaction.options.getUser("user", true);
                const PAGE_SIZE = 10;
                const reqPage = interaction.options.getInteger("page") ?? 1;
                const page = Math.max(1, reqPage);
                const offset = (page - 1) * PAGE_SIZE;

                // Helper to convert various epoch units to seconds
                const toSeconds = (val: any): number => {
                    if (val == null) return 0;
                    const n = typeof val === "string" ? parseInt(val, 10) : Number(val);
                    if (!isFinite(n)) return 0;
                    return n > 1_000_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
                };

                // Fetch warnings (paged) and count
                const warnCountRows: any = await db.query("SELECT COUNT(*) AS c FROM global_warnings WHERE userid = ?", [user.id]);
                const warnCount = Array.isArray(warnCountRows) && warnCountRows.length ? (warnCountRows[0].c ?? 0) : 0;
                const warns: any = await db.query(
                    "SELECT userid, authorid, reason, createdAt FROM global_warnings WHERE userid = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?",
                    [user.id, PAGE_SIZE, offset]
                );

                // Fetch blacklist current status
                const bansRows: any = await db.query("SELECT active, times FROM global_bans WHERE id = ? LIMIT 1", [user.id]);
                const ban = Array.isArray(bansRows) && bansRows.length ? bansRows[0] : null;

                // Fetch mute current status
                const muteRows: any = await db.query(
                    "SELECT reason, authorid, createdAt, until FROM global_mutes WHERE id = ? LIMIT 1",
                    [user.id]
                );
                const mute = Array.isArray(muteRows) && muteRows.length ? muteRows[0] : null;

                const embed = new EmbedBuilder()
                    .setTitle(`Cases for ${user.username}`)
                    .setColor("Purple");

                // Description with blacklist and mute status
                const blStatus = ban ? `${ban.active ? "Active" : "Inactive"}${typeof ban.times === "number" ? ` (times ${ban.times})` : ""}` : "None";
                let muteStatus = "None";
                if (mute) {
                    const untilSec = toSeconds(mute.until);
                    const nowSec = Math.floor(Date.now() / 1000);
                    const active = untilSec === 0 || untilSec > nowSec;
                    muteStatus = active
                        ? (untilSec === 0 ? "Active (indefinite)" : `Active until <t:${untilSec}:R>`) + (mute.reason ? ` — ${mute.reason}` : "")
                        : `Expired ${untilSec ? `<t:${untilSec}:R>` : ""}`;
                }

                embed.setDescription(`Blacklist: ${blStatus}\nMute: ${muteStatus}`);

                // Warnings fields (paged)
                                let totalPages = 1;
                                if (warnCount === 0) {
                    embed.addFields({ name: "Warnings", value: "No warnings.", inline: false });
                } else {
                                        totalPages = Math.max(1, Math.ceil(warnCount / PAGE_SIZE));
                    const list = Array.isArray(warns) ? warns : [];
                    list.forEach((w: any, i: number) => {
                        const createdSec = toSeconds(w.createdAt);
                        const idx = offset + i + 1;
                        const header = `#${idx} • by <@${w.authorid || "unknown"}> • ${createdSec ? `<t:${createdSec}:R>` : ""}`;
                        const value = (w.reason && String(w.reason).trim().length) ? String(w.reason).slice(0, 1024) : "(no reason)";
                        embed.addFields({ name: header, value, inline: false });
                    });
                    embed.setFooter({ text: `Warnings ${Math.min(offset + 1, warnCount)}-${Math.min(offset + list.length, warnCount)} of ${warnCount} • Page ${page}/${totalPages}` });
                }
                                // Build pagination buttons
                                const prev = new ButtonBuilder()
                                    .setCustomId(`staffcases-prev-${interaction.user.id}-${user.id}-${Math.max(1, page - 1)}`)
                                    .setLabel("Previous")
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(page <= 1);
                                const next = new ButtonBuilder()
                                    .setCustomId(`staffcases-next-${interaction.user.id}-${user.id}-${Math.min(totalPages, page + 1)}`)
                                    .setLabel("Next")
                                    .setStyle(ButtonStyle.Secondary)
                                    .setDisabled(page >= totalPages);
                                const close = new ButtonBuilder()
                                    .setCustomId(`staffcases-close-${interaction.user.id}`)
                                    .setLabel("Close")
                                    .setStyle(ButtonStyle.Danger);
                                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next, close);

                                return interaction.editReply({ embeds: [embed], content: null, components: [row] });
            }
        }
    },
    ephemeral: false
};
