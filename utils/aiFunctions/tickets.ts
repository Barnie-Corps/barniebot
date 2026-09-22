import utils, { closeSupportTicket } from "../../utils";
import db from "../../mysql/database";
import client from "../..";
import data from "../../data";
import Log from "../../Log";
import { EmbedBuilder, TextChannel, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const ticketsFunctions = {
    create_support_ticket: async (args: { userId: string; initialMessage: string; guildId?: string }): Promise<any> => {
      if (!args.userId || !args.initialMessage) return { error: "Missing parameters" };
      try {
        const homeGuild = await client.guilds.fetch(data.bot.home_guild);
        if (!homeGuild) return { error: "Support system is not properly configured" };
        const category = homeGuild.channels.cache.get(data.bot.support_category);
        if (!category || category.type !== ChannelType.GuildCategory) return { error: "Support category not found" };
        let guildName = null;
        if (args.guildId) {
          const guild = client.guilds.cache.get(args.guildId);
          guildName = guild?.name ?? null;
        }
        let assignedStaff: string | null = null;
        try {
          const allStaffResult: any = await db.query("SELECT uid FROM staff");
          const staffIds = allStaffResult.map((s: any) => s.uid);
          if (staffIds.length > 0) {
            const statuses: any = await db.query("SELECT user_id FROM staff_status WHERE user_id IN (?) AND status IN ('online', 'available')", [staffIds]);
            const availableStaffIds = statuses.map((s: any) => s.user_id);
            if (availableStaffIds.length > 0) {
              const workloads: any = await db.query("SELECT assigned_to, COUNT(*) as count FROM support_tickets WHERE assigned_to IN (?) AND status = 'open' GROUP BY assigned_to", [availableStaffIds]);
              const workloadMap = new Map<string, number>();
              workloads.forEach((w: any) => workloadMap.set(w.assigned_to, w.count));
              let minWorkload = Infinity;
              for (const staffId of availableStaffIds) {
                const workload = workloadMap.get(staffId) || 0;
                if (workload < minWorkload) {
                  minWorkload = workload;
                  assignedStaff = staffId;
                }
              }
            }
          }
        } catch (error) {
          assignedStaff = null;
        }
        const createdAt = Date.now();
        const result: any = await db.query("INSERT INTO support_tickets SET ?", [{
          user_id: args.userId,
          channel_id: "pending",
          status: "open",
          created_at: createdAt,
          initial_message: args.initialMessage,
          guild_id: args.guildId ?? null,
          guild_name: guildName,
          assigned_to: assignedStaff
        }]);
        const ticketId = result.insertId;
        const user = await client.users.fetch(args.userId);
        const channelName = `support-request-${ticketId}`;
        const ticketChannel = await homeGuild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: data.bot.support_category,
          topic: `Support ticket #${ticketId} - User: ${user.tag} (${args.userId})`
        });
        await db.query("UPDATE support_tickets SET channel_id = ? WHERE id = ?", [ticketChannel.id, ticketId]);
        const ticketEmbed = new EmbedBuilder()
          .setColor("Purple")
          .setTitle(`Ticket Information #${ticketId}`)
          .setThumbnail(user.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: "User", value: `${user.tag} (<@${user.id}>)\nID: ${user.id}`, inline: false },
            { name: "Ticket ID", value: `#${ticketId}`, inline: true },
            { name: "Status", value: "Open", inline: true },
            { name: "Priority", value: "🟡 Medium", inline: true },
            { name: "Category", value: "General", inline: true },
            { name: "Assigned To", value: assignedStaff ? `<@${assignedStaff}>` : "Unassigned", inline: true },
            { name: "Created At", value: `<t:${Math.floor(createdAt / 1000)}:F>`, inline: false },
            { name: "Origin", value: args.guildId ? `Guild: ${guildName ?? "Unknown"} (${args.guildId})` : "Direct Message", inline: false },
            { name: "Initial Message", value: args.initialMessage.length > 1024 ? args.initialMessage.substring(0, 1021) + "..." : args.initialMessage, inline: false }
          )
          .setFooter({ text: `User ID: ${user.id}` })
          .setTimestamp();

        const closeButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`close_ticket-${ticketId}-${args.userId}`)
            .setLabel("Close Ticket")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🔒")
        );

        const ticketMessage = await ticketChannel.send({
          content: assignedStaff ? `<@${assignedStaff}> - New ticket assigned to you!` : `<@&${data.bot.home_guild}> - New unassigned ticket!`,
          embeds: [ticketEmbed],
          components: [closeButton]
        });

        let createTexts = {
          title: "🎫 Support Ticket Created",
          description: `Your support ticket #${ticketId} has been created!\n\nOur staff will respond to you soon. You can close this ticket at any time using the button below.`,
          ticketId: "Ticket ID",
          status: "Status",
          open: "Open",
          footer: "All messages you send here will be forwarded to staff",
          closeTicket: "Close Ticket"
        };
        const creatorLang = await utils.getUserLanguage(args.userId);
        if (creatorLang !== "en") {
          try { createTexts = await utils.autoTranslate(createTexts, "en", creatorLang); } catch {}
        }
        const userCloseEmbed = new EmbedBuilder()
          .setColor("Purple")
          .setTitle(createTexts.title)
          .setDescription(createTexts.description)
          .addFields(
            { name: createTexts.ticketId, value: `#${ticketId}`, inline: true },
            { name: createTexts.status, value: createTexts.open, inline: true }
          )
          .setFooter({ text: createTexts.footer })
          .setTimestamp();

        const userCloseButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`close_ticket-${ticketId}-${args.userId}`)
            .setLabel(createTexts.closeTicket)
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🔒")
        );

        try {
          await user.send({ embeds: [userCloseEmbed], components: [userCloseButton] });
        } catch (error) {
          Log.error("Failed to send close option to user:", error);
        }

        await db.query("UPDATE support_tickets SET message_id = ? WHERE id = ?", [ticketMessage.id, ticketId]);

        await db.query("INSERT INTO support_messages SET ?", [{
          ticket_id: ticketId,
          user_id: args.userId,
          username: user.tag,
          content: args.initialMessage,
          timestamp: createdAt,
          is_staff: false,
          staff_rank: null
        }]);

        return { success: true, ticketId, channelId: ticketChannel.id, messageId: ticketMessage.id };
      } catch (error: any) {
        Log.error("Support ticket creation error:", error);
        return { error: error.message ?? "Failed to create support ticket" };
      }
    },
    create_bug_report: async (args: { userId: string; title: string; description: string; steps?: string; expected?: string; actual?: string; severity?: string; guildId?: string }): Promise<any> => {
      if (!args?.userId || !args.title || !args.description) return { error: "Missing parameters" };
      const channelId = data.bot.bug_reports_channel;
      if (!channelId) return { error: "Bug reports channel is not configured" };
      const channel = await client.channels.fetch(channelId).catch(() => null) as TextChannel | null;
      if (!channel || channel.type !== ChannelType.GuildText) return { error: "Bug reports channel not found" };

      const trimField = (value?: string, fallback: string = "N/A") => {
        if (!value || !value.trim()) return fallback;
        return value.length > 1024 ? value.substring(0, 1021) + "..." : value;
      };

      const user = await client.users.fetch(args.userId).catch(() => null);
      const embed = new EmbedBuilder()
        .setColor("Orange")
        .setTitle(`🐞 ${args.title}`)
        .setDescription(trimField(args.description, "No description provided"))
        .addFields(
          { name: "Reporter", value: user ? `${user.tag} (<@${args.userId}>)` : args.userId, inline: true },
          { name: "Severity", value: trimField(args.severity, "unspecified"), inline: true },
          { name: "Guild", value: args.guildId ? args.guildId : "unknown", inline: true },
          { name: "Steps to Reproduce", value: trimField(args.steps, "Not provided"), inline: false },
          { name: "Expected", value: trimField(args.expected, "Not provided"), inline: false },
          { name: "Actual", value: trimField(args.actual, "Not provided"), inline: false }
        )
        .setTimestamp();

      const sent = await channel.send({ embeds: [embed] });
      return { success: true, messageId: sent.id, channelId: sent.channelId };
    },
    get_ticket_details: async (args: { ticketId: number }): Promise<any> => {
      if (!args.ticketId) return { error: "Missing ticketId parameter" };
      const ticket: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [args.ticketId]);
      if (!ticket || !ticket[0]) return { error: "Ticket not found" };
      return { ticket: ticket[0] };
    },
    get_user_tickets: async (args: { userId: string; status?: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      let query = "SELECT * FROM support_tickets WHERE user_id = ?";
      const params: any[] = [args.userId];
      if (args.status) {
        query += " AND status = ?";
        params.push(args.status);
      }
      query += " ORDER BY created_at DESC";
      const tickets: any = await db.query(query, params);
      return { tickets: Array.isArray(tickets) ? tickets : [] };
    },
    assign_ticket: async (args: { requesterId?: string; ticketId: number; staffId: string }): Promise<any> => {
      if (!args?.requesterId || !args.ticketId || !args.staffId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to assign tickets" };
      const ticket: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [args.ticketId]);
      if (!ticket || !ticket[0]) return { error: "Ticket not found" };
      await db.query("UPDATE support_tickets SET assigned_to = ? WHERE id = ?", [args.staffId, args.ticketId]);
      await db.query("INSERT INTO staff_audit_log SET ?", [{
        staff_id: args.requesterId,
        action_type: "assign_ticket",
        target_id: String(args.ticketId),
        details: `Assigned to ${args.staffId}`,
        created_at: Date.now()
      }]);
      return { success: true };
    },
    close_ticket: async (args: { requesterId?: string; ticketId: number }): Promise<any> => {
      if (!args?.requesterId || !args.ticketId) return { error: "Missing parameters" };
      const ticketData: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [args.ticketId]);
      if (!ticketData || !ticketData[0]) return { error: "Ticket not found" };
      const ticket = ticketData[0];
      if (ticket.user_id !== args.requesterId && !await utils.isStaff(args.requesterId)) {
        return { error: "Requester is not authorized to close this ticket" };
      }
      const result = await closeSupportTicket({ ticketId: args.ticketId, closedById: args.requesterId, closedByLabel: args.requesterId });
      if ("error" in result) return result;
      return { success: true };
    },
    add_ticket_message: async (args: { ticketId: number; userId: string; username: string; content: string; isStaff?: boolean }): Promise<any> => {
      if (!args.ticketId || !args.userId || !args.username || !args.content) return { error: "Missing parameters" };
      const ticket: any = await db.query("SELECT * FROM support_tickets WHERE id = ?", [args.ticketId]);
      if (!ticket || !ticket[0]) return { error: "Ticket not found" };
      const staffRank = await utils.getUserStaffRank(args.userId);
      const message: any = {
        ticket_id: args.ticketId,
        user_id: args.userId,
        username: args.username,
        content: args.content,
        timestamp: Date.now(),
        is_staff: args.isStaff ?? false,
        staff_rank: staffRank
      };
      const result: any = await db.query("INSERT INTO support_messages SET ?", [message]);
      if (args.isStaff && !ticket[0].first_response_at) {
        await db.query("UPDATE support_tickets SET first_response_at = ?, first_response_by = ? WHERE id = ?", [Date.now(), args.userId, args.ticketId]);
      }
      return { success: true, messageId: result.insertId };
    },
    get_ticket_messages: async (args: { ticketId: number }): Promise<any> => {
      if (!args.ticketId) return { error: "Missing ticketId parameter" };
      const messages: any = await db.query("SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY timestamp ASC", [args.ticketId]);
      return { messages: Array.isArray(messages) ? messages : [] };
    },
    add_staff_note: async (args: { requesterId?: string; userId: string; note: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId || !args.note) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to add staff notes" };
      const noteData: any = {
        user_id: args.userId,
        staff_id: args.requesterId,
        note: args.note,
        created_at: Date.now()
      };
      const result: any = await db.query("INSERT INTO staff_notes SET ?", [noteData]);
      return { success: true, noteId: result.insertId };
    },
    get_staff_notes: async (args: { requesterId?: string; userId: string }): Promise<any> => {
      if (!args?.requesterId || !args.userId) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to view staff notes" };
      const notes: any = await db.query("SELECT * FROM staff_notes WHERE user_id = ? ORDER BY created_at DESC", [args.userId]);
      return { notes: Array.isArray(notes) ? notes : [] };
    },
    update_staff_status: async (args: { requesterId?: string; status: string; statusMessage?: string }): Promise<any> => {
      if (!args?.requesterId || !args.status) return { error: "Missing parameters" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to update staff status" };
      const validStatuses = ["online", "busy", "away", "offline"];
      if (!validStatuses.includes(args.status)) return { error: "Invalid status" };
      const existing: any = await db.query("SELECT * FROM staff_status WHERE user_id = ?", [args.requesterId]);
      if (existing && existing[0]) {
        await db.query("UPDATE staff_status SET status = ?, status_message = ?, updated_at = ? WHERE user_id = ?", [args.status, args.statusMessage ?? null, Date.now(), args.requesterId]);
      } else {
        await db.query("INSERT INTO staff_status SET ?", [{
          user_id: args.requesterId,
          status: args.status,
          status_message: args.statusMessage ?? null,
          updated_at: Date.now()
        }]);
      }
      return { success: true };
    },
    get_staff_audit_log: async (args: { requesterId?: string; staffId?: string; actionType?: string; limit?: number }): Promise<any> => {
      if (!args?.requesterId) return { error: "Missing requesterId parameter" };
      if (!await utils.isStaff(args.requesterId)) return { error: "Requester is not authorized to view audit log" };
      let query = "SELECT * FROM staff_audit_log WHERE 1=1";
      const params: any[] = [];
      if (args.staffId) {
        query += " AND staff_id = ?";
        params.push(args.staffId);
      }
      if (args.actionType) {
        query += " AND action_type = ?";
        params.push(args.actionType);
      }
      query += " ORDER BY created_at DESC";
      if (args.limit && args.limit > 0) {
        query += " LIMIT ?";
        params.push(args.limit);
      } else {
        query += " LIMIT 50";
      }
      const logs: any = await db.query(query, params);
      return { logs: Array.isArray(logs) ? logs : [] };
    },
};

export default ticketsFunctions;
