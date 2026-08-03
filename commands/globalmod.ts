import { ChatInputCommandInteraction, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import fs from "fs";
import utils from "../utils";
import db from "../mysql/database";
import client, { manager } from "..";
import data from "../data";
import { SupportTicket, SupportMessage } from "../types/interfaces";
import StaffRanksManager from "../managers/StaffRanksManager";

async function checkUserPoints(userId: string, username: string, executorId: string, executorUsername: string): Promise<{ totalPoints: number; escalated: boolean; action?: string }> {
  try {
    const result = (await db.query(
      "SELECT COALESCE(SUM(points), 0) AS total FROM global_warnings WHERE userid = ? AND active = TRUE AND (appeal_status IS NULL OR appeal_status != 'approved') AND expires_at > ?",
      [userId, Date.now()]
    ) as unknown as any[]);

    const totalPoints = Number(result?.[0]?.total ?? 0);

    if (totalPoints >= 5) {
      await db.query("INSERT INTO global_bans (id, active, times) VALUES (?, TRUE, 1) ON DUPLICATE KEY UPDATE active = TRUE, times = times + 1", [userId]);
      utils.invalidateStaffModCache(userId);
      await manager.announce(`⚠️ **AUTO-BAN**: User \`${username}\` has been automatically blacklisted due to reaching ${totalPoints} warning points.`, "en");
      await utils.logStaffAction(executorId, "AUTO_BAN", userId, `Auto-banned ${username} for ${totalPoints} points`, { totalPoints, threshold: 5 });
      return { totalPoints, escalated: true, action: "ban" };
    } else if (totalPoints >= 3) {
      const until = Date.now() + 24 * 60 * 60 * 1000;
      await db.query("INSERT INTO global_mutes SET ? ON DUPLICATE KEY UPDATE reason = VALUES(reason), authorid = VALUES(authorid), createdAt = VALUES(createdAt), until = VALUES(until)",
        [{ id: userId, reason: "Automatic mute due to warning points", authorid: executorId, createdAt: Date.now(), until }]);
      utils.invalidateStaffModCache(userId);
      await manager.announce(`⚠️ **AUTO-MUTE**: User \`${username}\` has been automatically muted for 24h due to reaching ${totalPoints} warning points.`, "en");
      await utils.logStaffAction(executorId, "AUTO_MUTE", userId, `Auto-muted ${username} for 24h (${totalPoints} points)`, { totalPoints, threshold: 3, duration: "24h" });
      return { totalPoints, escalated: true, action: "mute" };
    }

    return { totalPoints, escalated: false };
  } catch (error) {
    console.error("Failed to check user points:", error);
    return { totalPoints: 0, escalated: false };
  }
}

function ensureCoMPlus(executorRank: string | null): { ok: boolean; error?: string } {
  return utils.ensureCoMPlus(executorRank);
}
function ensureModPlus(executorRank: string | null): { ok: boolean; error?: string } {
  return utils.ensureModPlus(executorRank);
}
function ensureAnyStaff(executorRank: string | null): { ok: boolean; error?: string } {
  return utils.ensureStaff(executorRank);
}
function ensureProbAdminPlus(executorRank: string | null): { ok: boolean; error?: string } {
  return utils.ensureAdminPlus(executorRank);
}

let membersSearched = false;

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
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
      .addStringOption(o => o.setName("category").setDescription("Warning category").setRequired(true)
        .addChoices(
          { name: "Spam", value: "spam" },
          { name: "Harassment", value: "harassment" },
          { name: "NSFW", value: "nsfw" },
          { name: "Hate Speech", value: "hate_speech" },
          { name: "Impersonation", value: "impersonation" },
          { name: "Advertising", value: "advertising" },
          { name: "Doxxing", value: "doxxing" },
          { name: "Raiding", value: "raiding" },
          { name: "Disrespect", value: "disrespect" },
          { name: "General", value: "general" }
        ))
      .addIntegerOption(o => o.setName("points").setDescription("Warning points (1-5, default: 1)").setMinValue(1).setMaxValue(5).setRequired(false))
      .addIntegerOption(o => o.setName("expiry_days").setDescription("Days until expiry (30/60/90, default: 30)").setRequired(false)
        .addChoices(
          { name: "30 days", value: 30 },
          { name: "60 days", value: 60 },
          { name: "90 days", value: 90 }
        )))
    .addSubcommand(s => s.setName("mute").setDescription("Mute a user in global chat")
      .addUserOption(o => o.setName("user").setDescription("User").setRequired(true))
      .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes (0 for indefinite)").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(false)))
    .addSubcommand(s => s.setName("unmute").setDescription("Unmute a user in global chat")
      .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
    .addSubcommand(s => s.setName("status").setDescription("Check global moderation status of a user")
      .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
    .addSubcommand(s => s.setName("closeticket").setDescription("Close a support ticket")
      .addIntegerOption(o => o.setName("ticket_id").setDescription("Ticket ID").setRequired(true)))
    .addSubcommand(s => s.setName("search_user").setDescription("Search a user's ID by username and display found user info with moderation status")
      .addStringOption(o => o.setName("username").setDescription("Username to search for").setRequired(true)))
    .addSubcommand(s => s.setName("announce").setDescription("Send an announcement to global chat")
      .addStringOption(o => o.setName("language").setDescription("Language code").setRequired(true))),
  category: "Bot Staff",
  execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
    const sub = interaction.options.getSubcommand();
    const executor = interaction.user;
    const executorRank = await utils.getCachedUserStaffRank(executor.id);

    switch (sub) {
      case "blacklist": {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason") ?? "no reason";
        const perm = ensureCoMPlus(executorRank);
        if (!perm.ok) return utils.safeInteractionRespond(interaction, perm.error || "Permission denied.");
        await db.query("INSERT INTO global_bans (id, active, times) VALUES (?, TRUE, 1) ON DUPLICATE KEY UPDATE active = TRUE, times = times + 1", [user.id]);
        utils.invalidateStaffModCache(user.id);
        await manager.announce(`User \`${user.username}\` has been globally blacklisted by ${executor.username}. Reason: ${reason}`, "en");
        await utils.logStaffAction(executor.id, "BLACKLIST", user.id, `Blacklisted ${user.tag}`, { reason });
        return utils.safeInteractionRespond(interaction, `Blacklisted \`${user.username}\`. Reason: ${reason}`);
      }
      case "unblacklist": {
        const user = interaction.options.getUser("user", true);
        const perm = ensureCoMPlus(executorRank);
        if (!perm.ok) return utils.safeInteractionRespond(interaction, perm.error || "Permission denied.");
        await db.query("UPDATE global_bans SET active = FALSE WHERE id = ?", [user.id]);
        utils.invalidateStaffModCache(user.id);
        await manager.announce(`User \`${user.username}\` has been globally unblacklisted by ${executor.username}.`, "en");
        await utils.logStaffAction(executor.id, "UNBLACKLIST", user.id, `Removed blacklist for ${user.tag}`);
        return utils.safeInteractionRespond(interaction, `Removed blacklist for \`${user.username}\`.`);
      }
      case "warn": {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        const points = interaction.options.getInteger("points") ?? 1;
        const category = interaction.options.getString("category") ?? "general";
        const expiryDays = interaction.options.getInteger("expiry_days") ?? 30;

        const perm = ensureAnyStaff(executorRank);
        if (!perm.ok) return utils.safeInteractionRespond(interaction, perm.error || "Permission denied.");

        const expiresAt = Date.now() + (expiryDays * 24 * 60 * 60 * 1000);

        const insertResult: any = await db.query("INSERT INTO global_warnings SET ?", [{
          userid: user.id,
          reason,
          authorid: executor.id,
          createdAt: Date.now(),
          points,
          category,
          expires_at: expiresAt,
          active: true,
          appealed: false
        }]);

        const warningId = insertResult?.insertId || 0;

        const pointCheck = await checkUserPoints(user.id, user.username, executor.id, executor.username);

        const categoryEmojis: Record<string, string> = {
          spam: "📧",
          harassment: "😡",
          nsfw: "🔞",
          hate_speech: "🚫",
          impersonation: "🎭",
          advertising: "📢",
          doxxing: "🔍",
          raiding: "⚔️",
          disrespect: "😤",
          general: "⚠️"
        };

        const emoji = categoryEmojis[category] || "⚠️";
        const pointsText = points === 1 ? "1 point" : `${points} points`;

        const announceMsg = `${emoji} **Warning Issued**: User \`${user.username}\` has been warned by ${executor.username} (${pointsText}, ${category})${pointCheck.escalated ? ` and was automatically ${pointCheck.action === "ban" ? "blacklisted" : "muted"}` : ""}. Reason: ${reason}`;
        await manager.announce(announceMsg, "en");

        let responseMessage = `${emoji} **Warning Issued**\n`;
        responseMessage += `User: \`${user.username}\`\n`;
        responseMessage += `Points: **${pointsText}** (Total: ${pointCheck.totalPoints})\n`;
        responseMessage += `Category: ${category}\n`;
        responseMessage += `Reason: ${reason}\n`;
        responseMessage += `Expires: <t:${Math.floor(expiresAt / 1000)}:R>\n`;
        responseMessage += `Warning ID: #${warningId}`;

        if (pointCheck.escalated) {
          responseMessage += `\n\n🚨 **AUTO-ESCALATION TRIGGERED**: User ${pointCheck.action === "ban" ? "blacklisted" : "muted"} due to ${pointCheck.totalPoints} points!`;
        }

        await manager.Log(responseMessage, {
          warningId,
          userid: user.id,
          reason,
          points,
          category,
          expiresAt,
          executorId: executor.id,
          executorUsername: executor.username,
          totalPoints: pointCheck.totalPoints,
          escalated: pointCheck.escalated,
          escalationAction: pointCheck.action,
        });

        try {
          let warningTexts = {
            title: `${emoji} You've Received a Warning`,
            description: `You have been warned in the global chat by ${executor.username}.`,
            reason: "Reason",
            points: "Points",
            category: "Category",
            totalPoints: "Total Points",
            expires: "Expires",
            warningId: "Warning ID",
            footer: "You can appeal this warning using /appeal command",
            autoAction: "⚠️ Automatic Action Taken",
            banned: "You have been blacklisted from the global chat.",
            muted: "You have been muted for 24 hours."
          };
          const userLang = await utils.getUserLanguage(user.id);
          if (userLang !== "en") {
            try { warningTexts = await utils.autoTranslate(warningTexts, "en", userLang); } catch {}
          }
          const userEmbed = new EmbedBuilder()
            .setColor("Orange")
            .setTitle(warningTexts.title)
            .setDescription(warningTexts.description)
            .addFields(
              { name: warningTexts.reason, value: reason },
              { name: warningTexts.points, value: pointsText, inline: true },
              { name: warningTexts.category, value: category, inline: true },
              { name: warningTexts.totalPoints, value: pointCheck.totalPoints.toString(), inline: true },
              { name: warningTexts.expires, value: `<t:${Math.floor(expiresAt / 1000)}:R>` },
              { name: warningTexts.warningId, value: `#${warningId}` }
            )
            .setFooter({ text: warningTexts.footer })
            .setTimestamp();

          if (pointCheck.escalated) {
            userEmbed.addFields({
              name: warningTexts.autoAction,
              value: pointCheck.action === "ban" ? warningTexts.banned : warningTexts.muted
            });
          }

          await user.send({ embeds: [userEmbed] });
        } catch (error) {
          console.error("Failed to DM user:", error);
        }

        await utils.logStaffAction(executor.id, "WARN", user.id, `Warned ${user.tag} (${pointsText})`, {
          reason,
          points,
          category,
          expiryDays,
          warningId,
          totalPoints: pointCheck.totalPoints,
          escalated: pointCheck.escalated,
          escalationAction: pointCheck.action
        });

        return utils.safeInteractionRespond(interaction, responseMessage);
      }
      case "mute": {
        const user = interaction.options.getUser("user", true);
        const minutes = interaction.options.getInteger("minutes", true);
        const reason = interaction.options.getString("reason") ?? "no reason";
        const perm = ensureModPlus(executorRank);
        if (!perm.ok) return utils.safeInteractionRespond(interaction, perm.error || "Permission denied.");
        const until = minutes > 0 ? Date.now() + minutes * 60_000 : 0;
        await db.query("INSERT INTO global_mutes SET ? ON DUPLICATE KEY UPDATE reason = VALUES(reason), authorid = VALUES(authorid), createdAt = VALUES(createdAt), until = VALUES(until)", [{ id: user.id, reason, authorid: executor.id, createdAt: Date.now(), until }]);
        utils.invalidateStaffModCache(user.id);
        await manager.announce(`User \`${user.username}\` has been globally muted by ${executor.username}. Reason: ${reason}`, "en");
        await utils.logStaffAction(executor.id, "MUTE", user.id, `Muted ${user.tag}${minutes > 0 ? ` for ${minutes}m` : " indefinitely"}`, { reason, minutes, until });
        return utils.safeInteractionRespond(interaction, `Muted \`${user.username}\` ${minutes > 0 ? `for ${minutes}m` : "indefinitely"}.`);
      }
      case "unmute": {
        const user = interaction.options.getUser("user", true);
        const perm = ensureModPlus(executorRank);
        if (!perm.ok) return utils.safeInteractionRespond(interaction, perm.error || "Permission denied.");
        await db.query("DELETE FROM global_mutes WHERE id = ?", [user.id]);
        utils.invalidateStaffModCache(user.id);
        await manager.announce(`User \`${user.username}\` has been globally unmuted by ${executor.username}.`, "en");
        await utils.logStaffAction(executor.id, "UNMUTE", user.id, `Unmuted ${user.tag}`);
        return utils.safeInteractionRespond(interaction, `Unmuted \`${user.username}\`.`);
      }
      case "status": {
        const user = interaction.options.getUser("user", true);
        const [blacklisted, muted, rank] = await Promise.all([
          utils.isUserBlacklistedCached(user.id),
          utils.isUserMutedCached(user.id),
          utils.getCachedUserStaffRank(user.id)
        ]);
        return utils.safeInteractionRespond(interaction, `Status for \`${user.username}\`:\nRank: ${rank ?? "(none)"}\nBlacklisted: ${blacklisted ? "Yes" : "No"}\nMuted: ${muted ? "Yes" : "No"}`);
      }
      case "closeticket": {
        const ticketId = interaction.options.getInteger("ticket_id", true);
        const perm = ensureAnyStaff(executorRank);
        if (!perm.ok) return utils.safeInteractionRespond(interaction, perm.error || "Permission denied.");

        try {
          const ticketData = (await db.query("SELECT * FROM support_tickets WHERE id = ?", [ticketId]) as unknown as SupportTicket[]);
          if (!ticketData[0]) {
            return utils.safeInteractionRespond(interaction, `Ticket #${ticketId} not found.`);
          }

          const ticket = ticketData[0];
          if (ticket.status === "closed") {
            return utils.safeInteractionRespond(interaction, `Ticket #${ticketId} is already closed.`);
          }

          const user = await interaction.client.users.fetch(ticket.user_id);
          const messages = (await db.query("SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY timestamp ASC", [ticketId]) as unknown as SupportMessage[]);

          const durationMs = Date.now() - ticket.created_at;
          const hours = Math.floor(durationMs / 3600000);
          const minutes = Math.floor((durationMs % 3600000) / 60000);
          const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

          let textTranscript = `Support Ticket #${ticketId} - Transcript\n`;
          textTranscript += `User: ${user.tag} (${user.id})\n`;
          textTranscript += `Created: ${new Date(ticket.created_at).toISOString()}\n`;
          textTranscript += `Closed: ${new Date().toISOString()}\n`;
          textTranscript += `Duration: ${durationText}\n`;
          textTranscript += `Closed by: ${executor.tag} (${executor.id})\n`;
          textTranscript += `Origin: ${ticket.guild_id ? `Guild: ${ticket.guild_name} (${ticket.guild_id})` : "Direct Message"}\n`;
          textTranscript += `Initial Message: ${ticket.initial_message}\n`;
          textTranscript += `\n${"=".repeat(50)}\n\n`;

          for (const msg of messages) {
            const timestamp = new Date(msg.timestamp).toISOString();
            if (msg.is_staff) {
              const rankTag = utils.getRankSuffix(msg.staff_rank);
              textTranscript += `[${timestamp}] [${rankTag}] ${msg.username}: ${msg.content}\n`;
            } else {
              textTranscript += `[${timestamp}] ${msg.username}: ${msg.content}\n`;
            }
          }

          let htmlTemplate = await fs.promises.readFile("./transcript_placeholder.html", "utf-8");
          let messagesHtml = "";

          for (const msg of messages) {
            const timestamp = new Date(msg.timestamp).toLocaleString();
            const initial = msg.username?.charAt(0).toUpperCase();

            if (msg.is_staff) {
              const rankTag = utils.getRankSuffix(msg.staff_rank);
              messagesHtml += `
              <div class="message">
                  <div class="avatar">${initial}</div>
                  <div class="message-content">
                      <div class="message-header">
                          <span class="username">${msg.username}</span>
                          <span class="staff-badge">${rankTag}</span>
                          <span class="timestamp">${timestamp}</span>
                      </div>
                      <div class="message-text">${msg.content}</div>
                  </div>
              </div>`;
            } else {
              messagesHtml += `
              <div class="message">
                  <div class="avatar">${initial}</div>
                  <div class="message-content">
                      <div class="message-header">
                          <span class="username">${msg.username}</span>
                          <span class="timestamp">${timestamp}</span>
                      </div>
                      <div class="message-text">${msg.content}</div>
                  </div>
              </div>`;
            }
          }

          htmlTemplate = htmlTemplate
            .replace(/{ticketId}/g, ticketId.toString())
            .replace(/{username}/g, user.tag)
            .replace(/{userId}/g, user.id)
            .replace(/{status}/g, "Closed")
            .replace(/{statusClass}/g, "status-closed")
            .replace(/{createdAt}/g, new Date(ticket.created_at).toLocaleString())
            .replace(/{closedAt}/g, new Date().toLocaleString())
            .replace(/{origin}/g, ticket.guild_id ? `Guild: ${ticket.guild_name} (${ticket.guild_id})` : "Direct Message")
            .replace(/{initialMessage}/g, ticket.initial_message ?? "No initial message")
            .replace(/{messages}/g, messagesHtml);

          await fs.promises.writeFile(`./transcript-${ticketId}.txt`, textTranscript);
          await fs.promises.writeFile(`./transcript-${ticketId}.html`, htmlTemplate);

          const transcriptsChannel = await interaction.client.channels.fetch(data.bot.transcripts_channel);
          if (transcriptsChannel && transcriptsChannel.isTextBased()) {
            const transcriptEmbed = new EmbedBuilder()
              .setColor("Purple")
              .setTitle(`🎫 Ticket #${ticketId} - Closed`)
              .setDescription(`Ticket closed by ${executor.tag}`)
              .addFields(
                { name: "User", value: `${user.tag} (${user.id})`, inline: true },
                { name: "Messages", value: messages.length.toString(), inline: true },
                { name: "Duration", value: durationText, inline: true }
              )
              .setTimestamp();

            await (transcriptsChannel as any).send({
              embeds: [transcriptEmbed],
              files: [
                { attachment: `./transcript-${ticketId}.txt`, name: `transcript-${ticketId}.txt` },
                { attachment: `./transcript-${ticketId}.html`, name: `transcript-${ticketId}.html` }
              ]
            });
          }

          const closedAt = Date.now();
          await db.query("UPDATE support_tickets SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ?", [closedAt, executor.id, ticketId]);

          const ticketChannel = await interaction.client.channels.fetch(ticket.channel_id!);
          try {
            if (ticketChannel && ticketChannel.isTextBased() && ticket.message_id) {
              const originalMessage = await (ticketChannel as any).messages.fetch(ticket.message_id);
              const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
                .setColor("Red")
                .setTitle(`🔒 Ticket #${ticketId} - CLOSED`)
                .setFields(
                  originalMessage.embeds[0].fields.map((field: any) => {
                    if (field.name.toLowerCase().includes("status")) {
                      return { name: field.name, value: "Closed", inline: field.inline };
                    }
                    return field;
                  })
                );

              await originalMessage.edit({ embeds: [updatedEmbed], components: [] });
            }
          } catch (error) {
            console.error("Failed to update ticket embed:", error);
          }

          try {
            let closeTexts = {
              title: "🔒 Support Ticket Closed",
              description: `Your support ticket #${ticketId} has been closed by ${executor.tag}.`,
              duration: "Duration",
              messages: "Messages",
              footer: "Thank you for contacting support!"
            };
            const ticketOwnerLang = await utils.getUserLanguage(ticket.user_id);
            if (ticketOwnerLang !== "en") {
              try { closeTexts = await utils.autoTranslate(closeTexts, "en", ticketOwnerLang); } catch {}
            }
            const closedEmbed = new EmbedBuilder()
              .setColor("Red")
              .setTitle(closeTexts.title)
              .setDescription(closeTexts.description)
              .addFields(
                { name: closeTexts.duration, value: durationText, inline: true },
                { name: closeTexts.messages, value: messages.length.toString(), inline: true }
              )
              .setFooter({ text: closeTexts.footer })
              .setTimestamp();

            await user.send({ embeds: [closedEmbed] });
          } catch (error) {
            console.error("Failed to notify user:", error);
          }

          try {
            if (ticketChannel && ticketChannel.isTextBased()) {
              const closedNoticeEmbed = new EmbedBuilder()
                .setColor("Red")
                .setTitle("🔒 Ticket Closed")
                .setDescription(`This ticket has been closed by ${executor.tag}.\n\nTranscripts have been saved and sent to <#${data.bot.transcripts_channel}>.\n\nYou can delete this channel using the button below.`)
                .setTimestamp();

              const deleteButton = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                  new ButtonBuilder()
                    .setCustomId(`delete_channel-${ticketId}`)
                    .setLabel("Delete Channel")
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji("🗑️")
                );

              await (ticketChannel as any).send({ embeds: [closedNoticeEmbed], components: [deleteButton] });
            }
          } catch (error) {
            console.error("Failed to send close notice:", error);
          }

          await fs.promises.unlink(`./transcript-${ticketId}.txt`);
          await fs.promises.unlink(`./transcript-${ticketId}.html`);

          return utils.safeInteractionRespond(interaction, `Ticket #${ticketId} has been closed successfully.`);
        } catch (error) {
          console.error("Failed to close ticket:", error);
          return utils.safeInteractionRespond(interaction, "Failed to close ticket. Please try again.");
        }
      }
      case "search_user": {
        const username = interaction.options.getString("username", true);
        const perm = ensureAnyStaff(executorRank);
        if (!perm.ok) return utils.safeInteractionRespond(interaction, perm.error || "Permission denied.");
        await utils.safeInteractionRespond(interaction, "Searching, please wait...");
        if (!membersSearched) {
          membersSearched = true;
          const guilds = Array.from(client.guilds.cache.values());
          for (let i = 0; i < guilds.length; i += 10) {
            await Promise.all(guilds.slice(i, i + 10).map(g => g.members.fetch().catch(() => null)));
          }
        }
        const query = username.toLowerCase();
        const allUsers = client.users.cache.filter(u => {
          if (u.bot) return false;
          const uname = (u.username || "").toLowerCase();
          const dname = (u.displayName || "").toLowerCase();
          return uname.includes(query) || dname.includes(query);
        });
        if (allUsers.size === 0) return utils.safeInteractionRespond(interaction, `No users found matching '${username}'.`);
        const matches = Array.from(allUsers.values()).slice(0, 100);
        const userStatusCache: Array<{ user: any; rank: string; blacklisted: boolean; muted: boolean; points: number }> = [];
        const uids = matches.map(u => u.id);
        const ph = uids.map(() => "?").join(",");
        const owners = new Set(data.bot.owners || []);
        const now = Date.now();

        const [staffRows, banRows, muteRows, warningRows] = await Promise.all([
          db.query(`SELECT uid, hierarchy_position FROM staff WHERE uid IN (${ph})`, uids) as any,
          db.query(`SELECT id FROM global_bans WHERE id IN (${ph}) AND active = TRUE`, uids) as any,
          db.query(`SELECT id, until FROM global_mutes WHERE id IN (${ph})`, uids) as any,
          db.query(`SELECT userid, points FROM global_warnings WHERE userid IN (${ph}) AND active = TRUE AND expires_at > ? AND (appeal_status IS NULL OR appeal_status != 'approved')`, [...uids, now]) as any,
        ]);

        const rankMap = new Map<string, string>();
        for (const row of (Array.isArray(staffRows) ? staffRows : [])) {
          const rd = StaffRanksManager.getRankByHierarchy(Number(row.hierarchy_position));
          if (rd) rankMap.set(row.uid, rd.name);
        }

        const bannedSet = new Set<string>();
        for (const row of (Array.isArray(banRows) ? banRows : [])) {
          bannedSet.add(row.id);
        }

        const mutedSet = new Set<string>();
        const expiredMuteIds: string[] = [];
        for (const row of (Array.isArray(muteRows) ? muteRows : [])) {
          if (row.until && Number(row.until) > 0) {
            if (now >= Number(row.until)) { expiredMuteIds.push(row.id); continue; }
          }
          mutedSet.add(row.id);
        }
        if (expiredMuteIds.length > 0) {
          const eph = expiredMuteIds.map(() => "?").join(",");
          Promise.resolve(db.query(`DELETE FROM global_mutes WHERE id IN (${eph})`, expiredMuteIds)).catch(() => {});
        }

        const warnPointsMap = new Map<string, number>();
        for (const row of (Array.isArray(warningRows) ? warningRows : [])) {
          warnPointsMap.set(row.userid, (warnPointsMap.get(row.userid) || 0) + (row.points || 1));
        }

        for (const u of matches) {
          userStatusCache.push({
            user: u,
            rank: owners.has(u.id) ? "Owner" : rankMap.get(u.id) || "None",
            blacklisted: bannedSet.has(u.id),
            muted: mutedSet.has(u.id),
            points: warnPointsMap.get(u.id) || 0,
          });
        }
        if (userStatusCache.length === 1) {
          const entry = userStatusCache[0];
          const embed = new EmbedBuilder()
            .setColor("Purple")
            .setTitle(`User Search Result`)
            .setDescription(`Exact result for '${username}'`)
            .addFields(
              { name: "Username", value: `@${entry.user.username}`, inline: true },
              { name: "Display Name", value: entry.user.displayName || "N/A", inline: true },
              { name: "Rank", value: entry.rank, inline: true },
              { name: "Warnings Points", value: entry.points.toString(), inline: true },
              { name: "Blacklisted", value: entry.blacklisted ? "Yes" : "No", inline: true },
              { name: "Muted", value: entry.muted ? "Yes" : "No", inline: true }
            )
            .setTimestamp();
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`copyid_${entry.user.id}`).setLabel("Copy User ID").setStyle(ButtonStyle.Secondary).setEmoji("📋")
          );
          const msg = await utils.safeInteractionRespond(interaction, { content: "", embeds: [embed], components: [row] });
          const collector = (msg as any).createMessageComponentCollector({ time: 30000, filter: (i: any) => i.user.id === executor.id });
          collector.on("collect", async (i: any) => {
            if (i.customId === `copyid_${entry.user.id}`) {
              await i.reply({ content: `\`${entry.user.id}\``, ephemeral: true });
            }
          });
          return;
        }
        let page = 0;
        const pageSize = 10;
        const totalPages = Math.ceil(userStatusCache.length / pageSize);
        const buildEmbed = () => {
          const slice = userStatusCache.slice(page * pageSize, page * pageSize + pageSize);
          const embed = new EmbedBuilder()
            .setColor("Purple")
            .setTitle(`User Search Results`)
            .setDescription(`Query: '${username}' | ${userStatusCache.length} result(s) | Page ${page + 1}/${totalPages}`)
            .setTimestamp();
          for (const entry of slice) {
            embed.addFields({
              name: `${entry.user.displayName} (@${entry.user.username})`,
              value: `ID: \`${entry.user.id}\` | Rank: ${entry.rank} | Points: ${entry.points} | Blacklisted: ${entry.blacklisted ? 'Yes' : 'No'} | Muted: ${entry.muted ? 'Yes' : 'No'}`,
              inline: false
            });
          }
          return embed;
        };
        const makeRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("search_prev").setEmoji("◀️").setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId("search_stop").setEmoji("⏹️").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("search_next").setEmoji("▶️").setStyle(ButtonStyle.Secondary).setDisabled(page + 1 >= totalPages)
        );
        const msg = await utils.safeInteractionRespond(interaction, { content: "", embeds: [buildEmbed()], components: [makeRow()] });
        const collector = (msg as any).createMessageComponentCollector({ time: 60000, filter: (i: any) => i.user.id === executor.id });
        collector.on("collect", async (i: any) => {
          if (i.customId === "search_prev" && page > 0) page--; else if (i.customId === "search_next" && page + 1 < totalPages) page++; else if (i.customId === "search_stop") { collector.stop("stop"); return utils.safeComponentUpdate(i, { embeds: [buildEmbed()], components: [] }); }
          await utils.safeComponentUpdate(i, { embeds: [buildEmbed()], components: [makeRow()] });
        });
        collector.on("end", async (_: any, r: any) => { if (r !== "stop") try { await (msg as any).edit({ embeds: [buildEmbed()], components: [] }); } catch { } });
        return;
      }
      case "announce": {
        const language = interaction.options.getString("language", true);
        const perm = ensureCoMPlus(executorRank);
        if (!perm.ok) return utils.safeInteractionRespond(interaction, perm.error || "Permission denied.");
        const prompt = new EmbedBuilder()
          .setColor("Purple")
          .setTitle("Announcement")
          .setDescription(`Language: \`${language}\`\nType the announcement message in this channel now. Attachments are supported.`)
          .setTimestamp();
        await utils.safeInteractionRespond(interaction, { content: "", embeds: [prompt] });
        if (!interaction.channel) return;
        const collector = (interaction.channel as any).createMessageCollector({
          time: 120000,
          filter: (m: any) => m.author.id === executor.id
        });
        collector.on("collect", async (m: any) => {
          collector.stop("captured");
          await m.delete().catch(() => { });
          const announceEmbed = new EmbedBuilder()
            .setColor("Purple")
            .setTitle("Announcement Sent")
            .addFields(
              { name: "Language", value: `\`${language}\``, inline: true },
              { name: "Message", value: m.content.substring(0, 100) + (m.content.length > 100 ? "..." : ""), inline: false }
            )
            .setFooter({ text: `Sent by ${executor.username}` })
            .setTimestamp();
          await utils.safeInteractionRespond(interaction, { content: "", embeds: [announceEmbed] });
          await manager.announce(m.content, language, m.attachments);
        });
        collector.on("end", async (_: any, reason: string) => {
          if (reason !== "captured") {
            try { await interaction.editReply({ content: "Announcement cancelled (no message received)." }); } catch { }
          }
        });
        return;
      }
    }
  },
  ephemeral: false
};
