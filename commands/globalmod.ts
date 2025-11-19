import { ChatInputCommandInteraction, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";
import client, { manager } from "..";

// Helper to log staff actions
async function logStaffAction(staffId: string, actionType: string, targetId: string | null, details: string, metadata?: any) {
  try {
    await db.query("INSERT INTO staff_audit_log SET ?", [{
      staff_id: staffId,
      action_type: actionType,
      target_id: targetId,
      details: details,
      metadata: metadata ? JSON.stringify(metadata) : null,
      created_at: Date.now()
    }]);
  } catch (error) {
    console.error("Failed to log staff action:", error);
  }
}

// Calculate total active warning points and trigger auto-escalation
async function checkUserPoints(userId: string, username: string, executorId: string, executorUsername: string): Promise<{ totalPoints: number; escalated: boolean; action?: string }> {
  try {
    // Get all active warnings (not expired, not appealed/approved)
    const warnings: any = await db.query(
      "SELECT * FROM global_warnings WHERE userid = ? AND active = TRUE AND (appeal_status IS NULL OR appeal_status != 'approved') AND expires_at > ?",
      [userId, Date.now()]
    );

    const totalPoints = warnings.reduce((sum: number, w: any) => sum + (w.points || 1), 0);

    // Auto-escalation thresholds
    if (totalPoints >= 5) {
      // Auto-ban at 5+ points
      await db.query("INSERT INTO global_bans (id, active, times) VALUES (?, TRUE, 1) ON DUPLICATE KEY UPDATE active = TRUE, times = times + 1", [userId]);
      await manager.announce(`⚠️ **AUTO-BAN**: User \`${username}\` has been automatically blacklisted due to reaching ${totalPoints} warning points.`, "en");
      await logStaffAction(executorId, "AUTO_BAN", userId, `Auto-banned ${username} for ${totalPoints} points`, { totalPoints, threshold: 5 });
      return { totalPoints, escalated: true, action: "ban" };
    } else if (totalPoints >= 3) {
      // Auto-mute at 3-4 points (24 hours)
      const until = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      await db.query("INSERT INTO global_mutes SET ? ON DUPLICATE KEY UPDATE reason = VALUES(reason), authorid = VALUES(authorid), createdAt = VALUES(createdAt), until = VALUES(until)",
        [{ id: userId, reason: "Automatic mute due to warning points", authorid: executorId, createdAt: Date.now(), until }]);
      await manager.announce(`⚠️ **AUTO-MUTE**: User \`${username}\` has been automatically muted for 24h due to reaching ${totalPoints} warning points.`, "en");
      await logStaffAction(executorId, "AUTO_MUTE", userId, `Auto-muted ${username} for 24h (${totalPoints} points)`, { totalPoints, threshold: 3, duration: "24h" });
      return { totalPoints, escalated: true, action: "mute" };
    }

    return { totalPoints, escalated: false };
  } catch (error) {
    console.error("Failed to check user points:", error);
    return { totalPoints: 0, escalated: false };
  }
}

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
      .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true))
      .addIntegerOption(o => o.setName("points").setDescription("Warning points (1-5, default: 1)").setMinValue(1).setMaxValue(5).setRequired(false))
      .addStringOption(o => o.setName("category").setDescription("Warning category").setRequired(false)
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
      .addStringOption(o => o.setName("username").setDescription("Username to search for").setRequired(true))),
  category: "Bot Staff",
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
        await logStaffAction(executor.id, "BLACKLIST", user.id, `Blacklisted ${user.tag}`, { reason });
        return interaction.editReply(`Blacklisted \`${user.username}\`. Reason: ${reason}`);
      }
      case "unblacklist": {
        const user = interaction.options.getUser("user", true);
        const perm = ensureCoMPlus(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");
        await db.query("UPDATE global_bans SET active = FALSE WHERE id = ?", [user.id]);
        await manager.announce(`User \`${user.username}\` has been globally unblacklisted by ${executor.username}.`, "en");
        await logStaffAction(executor.id, "UNBLACKLIST", user.id, `Removed blacklist for ${user.tag}`);
        return interaction.editReply(`Removed blacklist for \`${user.username}\`.`);
      }
      case "warn": {
        const user = interaction.options.getUser("user", true);
        const reason = interaction.options.getString("reason", true);
        const points = interaction.options.getInteger("points") ?? 1;
        const category = interaction.options.getString("category") ?? "general";
        const expiryDays = interaction.options.getInteger("expiry_days") ?? 30;

        const perm = ensureAnyStaff(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

        // Calculate expiry timestamp
        const expiresAt = Date.now() + (expiryDays * 24 * 60 * 60 * 1000);

        // Insert warning with enhanced data
        await db.query("INSERT INTO global_warnings SET ?", [{
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

        // Get warning ID for reference
        const warningResult: any = await db.query("SELECT LAST_INSERT_ID() as id");
        const warningId = warningResult[0].id;

        // Check for auto-escalation
        const pointCheck = await checkUserPoints(user.id, user.username, executor.id, executor.username);

        // Category emoji mapping
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

        await manager.announce(responseMessage, "en");

        // DM the user
        try {
          const userEmbed = new EmbedBuilder()
            .setColor("Orange")
            .setTitle(`${emoji} You've Received a Warning`)
            .setDescription(`You have been warned in the global chat by ${executor.username}.`)
            .addFields(
              { name: "Reason", value: reason },
              { name: "Points", value: pointsText, inline: true },
              { name: "Category", value: category, inline: true },
              { name: "Total Points", value: pointCheck.totalPoints.toString(), inline: true },
              { name: "Expires", value: `<t:${Math.floor(expiresAt / 1000)}:R>` },
              { name: "Warning ID", value: `#${warningId}` }
            )
            .setFooter({ text: "You can appeal this warning using /appeal command" })
            .setTimestamp();

          if (pointCheck.escalated) {
            userEmbed.addFields({
              name: "⚠️ Automatic Action Taken",
              value: pointCheck.action === "ban" ? "You have been blacklisted from the global chat." : "You have been muted for 24 hours."
            });
          }

          await user.send({ embeds: [userEmbed] });
        } catch (error) {
          console.error("Failed to DM user:", error);
        }

        await logStaffAction(executor.id, "WARN", user.id, `Warned ${user.tag} (${pointsText})`, {
          reason,
          points,
          category,
          expiryDays,
          warningId,
          totalPoints: pointCheck.totalPoints,
          escalated: pointCheck.escalated,
          escalationAction: pointCheck.action
        });

        return interaction.editReply(responseMessage);
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
        await logStaffAction(executor.id, "MUTE", user.id, `Muted ${user.tag}${minutes > 0 ? ` for ${minutes}m` : " indefinitely"}`, { reason, minutes, until });
        return interaction.editReply(`Muted \`${user.username}\` ${minutes > 0 ? `for ${minutes}m` : "indefinitely"}.`);
      }
      case "unmute": {
        const user = interaction.options.getUser("user", true);
        const perm = ensureModPlus(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");
        await db.query("DELETE FROM global_mutes WHERE id = ?", [user.id]);
        await manager.announce(`User \`${user.username}\` has been globally unmuted by ${executor.username}.`, "en");
        await logStaffAction(executor.id, "UNMUTE", user.id, `Unmuted ${user.tag}`);
        return interaction.editReply(`Unmuted \`${user.username}\`.`);
      }
      case "status": {
        const user = interaction.options.getUser("user", true);
        const blacklisted = await utils.isUserBlacklisted(user.id);
        const muted = await utils.isUserMuted(user.id);
        const rank = await utils.getUserStaffRank(user.id);
        return interaction.editReply(`Status for \`${user.username}\`:\nRank: ${rank ?? "(none)"}\nBlacklisted: ${blacklisted ? "Yes" : "No"}\nMuted: ${muted ? "Yes" : "No"}`);
      }
      case "closeticket": {
        const ticketId = interaction.options.getInteger("ticket_id", true);
        const perm = ensureAnyStaff(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");

        try {
          const ticketData: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [ticketId]);
          if (!ticketData[0]) {
            return interaction.editReply(`Ticket #${ticketId} not found.`);
          }

          const ticket = ticketData[0];
          if (ticket.status === "closed") {
            return interaction.editReply(`Ticket #${ticketId} is already closed.`);
          }

          const user = await interaction.client.users.fetch(ticket.user_id);
          const messages: any = await db.query("SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY timestamp ASC", [ticketId]);

          // Calculate duration
          const durationMs = Date.now() - ticket.created_at;
          const hours = Math.floor(durationMs / 3600000);
          const minutes = Math.floor((durationMs % 3600000) / 60000);
          const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

          // Generate transcripts (same logic as button handler)
          const fs = await import("fs");
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

          let htmlTemplate = fs.readFileSync("./transcript_placeholder.html", "utf-8");
          let messagesHtml = "";

          for (const msg of messages) {
            const timestamp = new Date(msg.timestamp).toLocaleString();
            const initial = msg.username.charAt(0).toUpperCase();

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
            .replace(/{initialMessage}/g, ticket.initial_message)
            .replace(/{messages}/g, messagesHtml);

          fs.writeFileSync(`./transcript-${ticketId}.txt`, textTranscript);
          fs.writeFileSync(`./transcript-${ticketId}.html`, htmlTemplate);

          // Send to transcripts channel
          const data = (await import("../data")).default;
          const transcriptsChannel = await interaction.client.channels.fetch(data.bot.transcripts_channel);
          if (transcriptsChannel && transcriptsChannel.isTextBased()) {
            const { EmbedBuilder } = await import("discord.js");
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

          // Update the original embed in ticket channel
          try {
            const ticketChannel = await interaction.client.channels.fetch(ticket.channel_id);
            if (ticketChannel && ticketChannel.isTextBased() && ticket.message_id) {
              const originalMessage = await (ticketChannel as any).messages.fetch(ticket.message_id);
              const { EmbedBuilder } = await import("discord.js");
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

          // Notify user with embed
          try {
            const { EmbedBuilder } = await import("discord.js");
            const closedEmbed = new EmbedBuilder()
              .setColor("Red")
              .setTitle("🔒 Support Ticket Closed")
              .setDescription(`Your support ticket #${ticketId} has been closed by ${executor.tag}.`)
              .addFields(
                { name: "Duration", value: durationText, inline: true },
                { name: "Messages", value: messages.length.toString(), inline: true }
              )
              .setFooter({ text: "Thank you for contacting support!" })
              .setTimestamp();

            await user.send({ embeds: [closedEmbed] });
          } catch (error) {
            console.error("Failed to notify user:", error);
          }

          // Send message in ticket channel with delete option
          try {
            const ticketChannel = await interaction.client.channels.fetch(ticket.channel_id);
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

          fs.unlinkSync(`./transcript-${ticketId}.txt`);
          fs.unlinkSync(`./transcript-${ticketId}.html`);

          return interaction.editReply(`Ticket #${ticketId} has been closed successfully.`);
        } catch (error) {
          console.error("Failed to close ticket:", error);
          return interaction.editReply("Failed to close ticket. Please try again.");
        }
      }
      case "search_user": {
        const username = interaction.options.getString("username", true);
        const perm = ensureAnyStaff(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");
        await interaction.editReply("Searching, please wait...");
        if (Number(process.env.MEMBERS_FETCHED) === 0) for (const g of client.guilds.cache.values()) await g.members.fetch();
        const query = username.toLowerCase();
        const allUsers = client.users.cache.filter(u => u.username.toLowerCase().includes(query) || u.displayName.toLowerCase().includes(query) && !u.bot);
        if (allUsers.size === 0) return interaction.editReply(`No users found matching '${username}'.`);
        const matches = Array.from(allUsers.values()).slice(0, 100);
        const userStatusCache: any[] = [];
        for (const u of matches) {
          const rank = await utils.getUserStaffRank(u.id);
          const blacklisted = await utils.isUserBlacklisted(u.id);
          const muted = await utils.isUserMuted(u.id);
          const warnings: any = await db.query("SELECT points, expires_at, active, appeal_status FROM global_warnings WHERE userid = ?", [u.id]);
          const now = Date.now();
          const totalPoints = warnings.filter((w: any) => w.active && w.expires_at > now && (!w.appeal_status || w.appeal_status !== 'approved')).reduce((s: number, w: any) => s + (w.points || 1), 0);
          userStatusCache.push({ user: u, rank: rank || "None", blacklisted, muted, points: totalPoints });
        }
        if (userStatusCache.length === 1) {
          const entry = userStatusCache[0];
          const embed = new EmbedBuilder()
            .setColor("Purple")
            .setTitle(`User Search Result`)
            .setDescription(`Exact result for '${username}'`)
            .addFields(
              { name: "Username", value: `${entry.user.username} (${entry.user.id})`, inline: true },
              { name: "Display Name", value: entry.user.displayName || "N/A", inline: true },
              { name: "Rank", value: entry.rank, inline: true },
              { name: "Warnings Points", value: entry.points.toString(), inline: true },
              { name: "Blacklisted", value: entry.blacklisted ? "Yes" : "No", inline: true },
              { name: "Muted", value: entry.muted ? "Yes" : "No", inline: true }
            )
            .setTimestamp();
          return interaction.editReply({ content: "", embeds: [embed] });
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
              name: `${entry.user.displayName} (@${entry.user.username}) -> (${entry.user.id})`,
              value: `Rank: ${entry.rank} | Points: ${entry.points} | Blacklisted: ${entry.blacklisted ? 'Yes' : 'No'} | Muted: ${entry.muted ? 'Yes' : 'No'}`,
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
        const msg = await interaction.editReply({ content: "", embeds: [buildEmbed()], components: [makeRow()] });
        const collector = (msg as any).createMessageComponentCollector({ time: 60000, filter: (i: any) => i.user.id === executor.id });
        collector.on("collect", async (i: any) => {
          if (i.customId === "search_prev" && page > 0) page--; else if (i.customId === "search_next" && page + 1 < totalPages) page++; else if (i.customId === "search_stop") { collector.stop("stop"); return i.update({ embeds: [buildEmbed()], components: [] }); }
          await i.update({ embeds: [buildEmbed()], components: [makeRow()] });
        });
        collector.on("end", async (_: any, r: any) => { if (r !== "stop") try { await (msg as any).edit({ embeds: [buildEmbed()], components: [] }); } catch {} });
        return;
      }
    }
  },
  ephemeral: false
};
