import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";
import { manager } from "..";

function ensureCoMPlus(executorRank: string | null): { ok: boolean; error?: string } {
  const idx = utils.getStaffRankIndex(executorRank);
  const min = utils.getStaffRankIndex("Chief of Moderation");
  if (idx < 0 || idx < min) return { ok: false, error: "Insufficient permissions (Chief of Moderation+ required)." };
  return { ok: true };
}
function ensureModPlus(executorRank: string | null): { ok: boolean; error?: string } {
  const idx = utils.getStaffRankIndex(executorRank);
  const min = utils.getStaffRankIndex("Moderator");
  if (idx < 0 || idx < min) return { ok: false, error: "Insufficient permissions (Moderator+ required)." };
  return { ok: true };
}
function ensureAnyStaff(executorRank: string | null): { ok: boolean; error?: string } {
  const idx = utils.getStaffRankIndex(executorRank);
  if (idx < 0) return { ok: false, error: "Insufficient permissions (staff only)." };
  return { ok: true };
}
function ensureProbAdminPlus(executorRank: string | null): { ok: boolean; error?: string } {
  const idx = utils.getStaffRankIndex(executorRank);
  const min = utils.getStaffRankIndex("Probationary Administrator");
  if (idx < 0 || idx < min) return { ok: false, error: "Insufficient permissions (Probationary Administrator+ required)." };
  return { ok: true };
}

export default {
  data: new SlashCommandBuilder()
    .setName("globalmod")
    .setDescription("Global chat moderation")
    .addSubcommand(s => s.setName("blacklist").setDescription("Blacklist a user from global chat")
      .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)))
    .addSubcommand(s => s.setName("unblacklist").setDescription("Remove blacklist")
      .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
    .addSubcommand(s => s.setName("warn").setDescription("Warn a user globally")
      .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)))
    .addSubcommand(s => s.setName("mute").setDescription("Mute a user in global chat")
      .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
      .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes (0 for indefinite)").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)))
    .addSubcommand(s => s.setName("unmute").setDescription("Unmute a user in global chat")
      .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
    .addSubcommand(s => s.setName("status").setDescription("Check global moderation status of a user")
      .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))),
  execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
    const sub = interaction.options.getSubcommand();
    const executor = interaction.user;
    const executorRank = await utils.getUserStaffRank(executor.id);

    switch (sub) {
      case "blacklist": {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "no reason";
        const perm = ensureCoMPlus(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");
        await db.query("INSERT INTO global_bans (id, active, times) VALUES (?, TRUE, 1) ON DUPLICATE KEY UPDATE active = TRUE, times = times + 1", [user.id]);
        await manager.announce(`User \`${user.username}\` has been globally blacklisted by ${executor.username}. Reason: ${reason}`, "en");
        return interaction.editReply(`Blacklisted \`${user.username}\`. Reason: ${reason}`);
      }
      case "unblacklist": {
        const user = interaction.options.getUser("user", true);
        const perm = ensureCoMPlus(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");
        await db.query("UPDATE global_bans SET active = FALSE WHERE id = ?", [user.id]);
        await manager.announce(`User \`${user.username}\` has been globally unblacklisted by ${executor.username}.`, "en");
        return interaction.editReply(`Removed blacklist for \`${user.username}\`.`);
      }
      case "warn": {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        const perm = ensureAnyStaff(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");
        await db.query("INSERT INTO global_warnings SET ?", [{ userid: user.id, reason, authorid: executor.id, createdAt: Math.floor(Date.now() / 1000) }]);
        await manager.announce(`User \`${user.username}\` has been globally warned by ${executor.username}. Reason: ${reason}`, "en");
        return interaction.editReply(`Warned \`${user.username}\`: ${reason}`);
      }
      case "mute": {
        const user = interaction.options.getUser("user", true);
        const minutes = interaction.options.getInteger("minutes", true);
        const reason = interaction.options.getString("reason") ?? "no reason";
        const perm = ensureModPlus(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");
        const until = minutes > 0 ? Date.now() + minutes * 60_000 : 0;
        await db.query("INSERT INTO global_mutes SET ? ON DUPLICATE KEY UPDATE reason = VALUES(reason), authorid = VALUES(authorid), createdAt = VALUES(createdAt), until = VALUES(until)", [{ id: user.id, reason, authorid: executor.id, createdAt: Date.now(), until }]);
        await manager.announce(`User \`${user.username}\` has been globally muted by ${executor.username}. Reason: ${reason}`, "en");
        return interaction.editReply(`Muted \`${user.username}\` ${minutes > 0 ? `for ${minutes}m` : "indefinitely"}.`);
      }
      case "unmute": {
        const user = interaction.options.getUser("user", true);
        const perm = ensureModPlus(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");
        await db.query("DELETE FROM global_mutes WHERE id = ?", [user.id]);
        await manager.announce(`User \`${user.username}\` has been globally unmuted by ${executor.username}.`, "en");
        return interaction.editReply(`Unmuted \`${user.username}\`.`);
      }
      case "status": {
        const user = interaction.options.getUser("user", true);
        const blacklisted = await utils.isUserBlacklisted(user.id);
        const muted = await utils.isUserMuted(user.id);
        const rank = await utils.getUserStaffRank(user.id);
        return interaction.editReply(`Status for \`${user.username}\`:\nRank: ${rank ?? "(none)"}\nBlacklisted: ${blacklisted ? "Yes" : "No"}\nMuted: ${muted ? "Yes" : "No"}`);
      }
    }
  },
  ephemeral: true
};
