import { ChatInputCommandInteraction, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";
import { manager } from "..";

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
      .addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
    .addSubcommand(s => s.setName("closeticket").setDescription("Close a support ticket")
      .addIntegerOption(o => o.setName("ticket_id").setDescription("Ticket ID").setRequired(true))),
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
        const perm = ensureAnyStaff(executorRank);
        if (!perm.ok) return interaction.editReply(perm.error || "Permission denied.");
        await db.query("INSERT INTO global_warnings SET ?", [{ userid: user.id, reason, authorid: executor.id, createdAt: Math.floor(Date.now() / 1000) }]);
        await manager.announce(`User \`${user.username}\` has been globally warned by ${executor.username}. Reason: ${reason}`, "en");
        await logStaffAction(executor.id, "WARN", user.id, `Warned ${user.tag}`, { reason });
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
    }
  },
  ephemeral: true
};
