// AI-callable tool implementations: Slowmode, message search, invites, webhooks, threads, scheduled events, emojis/stickers, pins, giveaways, reminders, and local-model status.
import utils, { getGuildAndMember, hasGuildPermission, isAdminStaffUser, isOwner } from "../../utils";
import db from "../../mysql/database";
import client from "../..";
import { PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const guildToolsFunctions = {
    set_slowmode: async (args: { requesterId?: string; guildId?: string; channelId: string; delay: number; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || args.delay === undefined) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) return { error: "Bot lacks ManageChannels permission" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel) return { error: "Channel not found" };
      const delay = Math.max(0, Math.min(Math.floor(args.delay), 21600));
      try {
        await channel.setRateLimitPerUser(delay, args.reason || "Slowmode updated by AI");
        return { success: true, slowmode: delay };
      } catch (error: any) {
        return { error: error.message ?? "Failed to set slowmode" };
      }
    },
    search_messages: async (args: { requesterId?: string; guildId?: string; channelId: string; query: string; limit?: number; before?: string; after?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.query) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const staff = await utils.isStaff(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel || !channel.isTextBased?.()) return { error: "Channel not found or not text-based" };
      if (!owner && !adminStaff && !staff) {
        const perms = channel.permissionsFor(member);
        if (!perms || !perms.has(PermissionFlagsBits.ReadMessageHistory)) return { error: "Requester lacks ReadMessageHistory permission" };
      }
      const botPerms = channel.permissionsFor(guild.members.me);
      if (!botPerms || !botPerms.has(PermissionFlagsBits.ReadMessageHistory)) return { error: "Bot lacks ReadMessageHistory permission" };
      const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
      const query = args.query.toLowerCase();
      try {
        const fetchOpts: any = { limit: 100 };
        if (args.before) fetchOpts.before = args.before;
        if (args.after) fetchOpts.after = args.after;
        let fetched = await channel.messages.fetch(fetchOpts);
        const matched = fetched.filter((m: any) => m.content && m.content.toLowerCase().includes(query)).first(limit);
        return { messages: matched.map((m: any) => ({ id: m.id, author: { id: m.author.id, username: m.author.username }, content: m.content.slice(0, 1000), timestamp: m.createdTimestamp })) };
      } catch (error: any) {
        return { error: error.message ?? "Failed to search messages" };
      }
    },
    list_invites: async (args: { requesterId?: string; guildId: string; channelId?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageGuild);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageGuild)) return { error: "Bot lacks ManageGuild permission" };
      try {
        const invites = await guild.invites.fetch();
        let filtered = invites.cache.values();
        if (args.channelId) filtered = [...filtered].filter((i: any) => i.channel?.id === args.channelId);
        return { invites: [...filtered].map((i: any) => ({ code: i.code, uses: i.uses, maxUses: i.maxUses, maxAge: i.maxAge, expiresAt: i.expiresTimestamp, channel: { id: i.channel?.id, name: i.channel?.name }, inviter: { id: i.inviter?.id, username: i.inviter?.username } })) };
      } catch (error: any) {
        return { error: error.message ?? "Failed to list invites" };
      }
    },
    create_invite: async (args: { requesterId?: string; guildId?: string; channelId: string; maxAge?: number; maxUses?: number; temporary?: boolean; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.CreateInstantInvite);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.CreateInstantInvite)) return { error: "Bot lacks CreateInstantInvite permission" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel) return { error: "Channel not found" };
      try {
        const invite = await channel.createInvite({
          maxAge: args.maxAge ?? 86400,
          maxUses: args.maxUses ?? 0,
          temporary: args.temporary ?? false,
          reason: args.reason || "Invite created by AI"
        });
        return { invite: { code: invite.code, url: invite.url, maxAge: invite.maxAge, maxUses: invite.maxUses } };
      } catch (error: any) {
        return { error: error.message ?? "Failed to create invite" };
      }
    },
    list_webhooks: async (args: { requesterId?: string; guildId: string; channelId?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageWebhooks);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageWebhooks)) return { error: "Bot lacks ManageWebhooks permission" };
      try {
        const webhooks = await guild.fetchWebhooks();
        let filtered = webhooks.cache.values();
        if (args.channelId) filtered = [...filtered].filter((w: any) => w.channelId === args.channelId);
        return { webhooks: [...filtered].map((w: any) => ({ id: w.id, name: w.name, channelId: w.channelId, url: w.url })) };
      } catch (error: any) {
        return { error: error.message ?? "Failed to list webhooks" };
      }
    },
    create_webhook: async (args: { requesterId?: string; guildId?: string; channelId: string; name: string; avatar?: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.name) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageWebhooks);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageWebhooks)) return { error: "Bot lacks ManageWebhooks permission" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel) return { error: "Channel not found" };
      try {
        const webhook = await channel.createWebhook({
          name: args.name,
          avatar: args.avatar || undefined,
          reason: args.reason || "Webhook created by AI"
        });
        return { webhook: { id: webhook.id, name: webhook.name, url: webhook.url } };
      } catch (error: any) {
        return { error: error.message ?? "Failed to create webhook" };
      }
    },
    manage_thread: async (args: { requesterId?: string; guildId?: string; channelId: string; action: string; name?: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.action) return { error: "Missing parameters" };
      const action = args.action.toLowerCase();
      if (!["archive", "unarchive", "lock", "unlock", "rename"].includes(action)) return { error: "Invalid action. Use: archive, unarchive, lock, unlock, rename" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageThreads);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageThreads)) return { error: "Bot lacks ManageThreads permission" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel) return { error: "Thread not found" };
      const isThread = channel.isThread();
      if (!isThread) return { error: "Channel is not a thread" };
      try {
        const reason = args.reason || `Thread ${action} by AI`;
        if (action === "archive") await channel.setArchived(true, reason);
        else if (action === "unarchive") await channel.setArchived(false, reason);
        else if (action === "lock") await channel.setLocked(true, reason);
        else if (action === "unlock") await channel.setLocked(false, reason);
        else if (action === "rename") {
          if (!args.name) return { error: "Name is required for rename action" };
          await channel.setName(args.name, reason);
        }
        return { success: true, action, threadId: args.channelId };
      } catch (error: any) {
        return { error: error.message ?? `Failed to ${action} thread` };
      }
    },
    manage_scheduled_event: async (args: { requesterId?: string; guildId: string; action: string; name?: string; channelId?: string; startTime?: string; description?: string; location?: string; eventId?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.action) return { error: "Missing parameters" };
      const action = args.action.toLowerCase();
      if (!["create", "list", "delete", "get"].includes(action)) return { error: "Invalid action. Use: create, list, delete, get" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageEvents);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageEvents)) return { error: "Bot lacks ManageEvents permission" };
      try {
        if (action === "list") {
          const events = await guild.scheduledEvents.fetch();
          return { events: events.cache.map((e: any) => ({ id: e.id, name: e.name, status: e.status, scheduledStartAt: e.scheduledStartAt, channelId: e.channelId, location: e.entityMetadata?.location, description: e.description })) };
        }
        if (action === "get") {
          if (!args.eventId) return { error: "eventId is required for get action" };
          const event = await guild.scheduledEvents.fetch(args.eventId);
          return { event: { id: event.id, name: event.name, status: event.status, scheduledStartAt: event.scheduledStartAt, channelId: event.channelId, location: event.entityMetadata?.location, description: event.description } };
        }
        if (action === "delete") {
          if (!args.eventId) return { error: "eventId is required for delete action" };
          await guild.scheduledEvents.delete(args.eventId);
          return { success: true, action: "delete" };
        }
        if (action === "create") {
          if (!args.name || !args.startTime) return { error: "name and startTime are required for create action" };
          const startDate = new Date(args.startTime);
          if (isNaN(startDate.getTime())) return { error: "Invalid startTime format. Use ISO 8601." };
          const eventData: any = { name: args.name, scheduledStartTime: startDate, description: args.description || "" };
          if (args.channelId) {
            eventData.channel = args.channelId;
            eventData.entityType = 2;
          } else if (args.location) {
            eventData.entityType = 3;
            eventData.entityMetadata = { location: args.location };
          } else {
            return { error: "Either channelId (voice/stage) or location (external) is required" };
          }
          const event = await guild.scheduledEvents.create(eventData);
          return { event: { id: event.id, name: event.name, status: event.status, scheduledStartAt: event.scheduledStartAt } };
        }
      } catch (error: any) {
        return { error: error.message ?? "Failed to manage scheduled event" };
      }
    },
    list_emojis: async (args: { requesterId?: string; guildId: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId) return { error: "Missing parameters" };
      const guild = await client.guilds.fetch(args.guildId).catch(() => null);
      if (!guild) return { error: "Guild not found" };
      try {
        const emojis = await guild.emojis.fetch();
        return { emojis: emojis.map((e: any) => ({ id: e.id, name: e.name, url: e.url, animated: e.animated, available: e.available })) };
      } catch (error: any) {
        return { error: error.message ?? "Failed to list emojis" };
      }
    },
    list_stickers: async (args: { requesterId?: string; guildId: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId) return { error: "Missing parameters" };
      const guild = await client.guilds.fetch(args.guildId).catch(() => null);
      if (!guild) return { error: "Guild not found" };
      try {
        const stickers = await guild.stickers.fetch();
        return { stickers: stickers.map((s: any) => ({ id: s.id, name: s.name, description: s.description, format: s.format, url: s.url })) };
      } catch (error: any) {
        return { error: error.message ?? "Failed to list stickers" };
      }
    },
    manage_pin: async (args: { requesterId?: string; guildId?: string; channelId: string; messageId: string; action: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.messageId || !args.action) return { error: "Missing parameters" };
      const action = args.action.toLowerCase();
      if (!["pin", "unpin"].includes(action)) return { error: "Invalid action. Use: pin or unpin" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageMessages);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageMessages)) return { error: "Bot lacks ManageMessages permission" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel || !channel.isTextBased?.()) return { error: "Channel not found or not text-based" };
      try {
        const message = await channel.messages.fetch(args.messageId);
        if (!message) return { error: "Message not found" };
        if (action === "pin") await message.pin();
        else await message.unpin();
        return { success: true, action, messageId: args.messageId };
      } catch (error: any) {
        return { error: error.message ?? `Failed to ${action} message` };
      }
    },
    manage_giveaway: async (args: {
      requesterId?: string;
      guildId?: string;
      channelId?: string;
      action: string;
      giveawayId?: number;
      prize?: string;
      description?: string;
      durationMs?: number;
      winnerCount?: number;
    }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.action) return { error: "Missing parameters" };
      const action = args.action.toLowerCase();
      if (!["start", "end", "reroll", "list"].includes(action)) return { error: "Invalid action. Use: start, end, reroll, list" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageGuild);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      try {
        if (action === "list") {
          const rows: any = await db.query("SELECT * FROM giveaways WHERE guild_id = ? AND ended = FALSE ORDER BY ends_at ASC", [args.guildId]);
          return {
            giveaways: rows.map((g: any) => ({ id: g.id, prize: g.prize, description: g.description, endsAt: g.ends_at, winnerCount: g.winner_count, channelId: g.channel_id }))
          };
        }
        if (action === "start") {
          if (!args.prize || !args.durationMs) return { error: "prize and durationMs are required for start action" };
          if (args.durationMs < 60000) return { error: "Minimum duration is 1 minute" };
          if (args.durationMs > 2592000000) return { error: "Maximum duration is 30 days" };
          const channelId = args.channelId;
          if (!channelId) return { error: "channelId is required for start action" };
          const channel = guild.channels.cache.get(channelId) as any;
          if (!channel || !channel.isTextBased?.()) return { error: "Channel not found or not text-based" };
          const winnerCount = Math.max(1, Math.min(args.winnerCount ?? 1, 25));
          const endsAt = Date.now() + args.durationMs;
          const result: any = await db.query("INSERT INTO giveaways SET ?", [{
            guild_id: args.guildId,
            channel_id: channelId,
            prize: args.prize,
            description: args.description || null,
            winner_count: winnerCount,
            ends_at: endsAt,
            created_by: args.requesterId,
            created_at: Date.now()
          }]);
          const giveawayId = result.insertId;
          const embed = new EmbedBuilder()
            .setColor("Gold")
            .setTitle(`🎉 ${args.prize}`)
            .setDescription(args.description || "")
            .addFields(
              { name: "Prize", value: args.prize, inline: true },
              { name: "Winner(s)", value: String(winnerCount), inline: true },
              { name: "Ends", value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
              { name: "Hosted by", value: `<@${args.requesterId}>`, inline: true }
            )
            .setFooter({ text: `ID: ${giveawayId}` })
            .setTimestamp();
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`giveaway_enter_${giveawayId}`).setLabel("🎉 Enter Giveaway").setStyle(ButtonStyle.Success).setEmoji("🎉")
          );
          const msg = await channel.send({ embeds: [embed], components: [row] });
          await db.query("UPDATE giveaways SET message_id = ? WHERE id = ?", [msg.id, giveawayId]);
          return { success: true, giveawayId, endsAt };
        }
        if (action === "end") {
          if (!args.giveawayId) return { error: "giveawayId is required for end action" };
          const rows: any = await db.query("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?", [args.giveawayId, args.guildId]);
          if (!rows[0]) return { error: "Giveaway not found" };
          if (rows[0].ended) return { error: "Giveaway already ended" };
          const requesterLang = await utils.getUserLanguage(args.requesterId).catch(() => "en");
          const result = await utils.resolveGiveaway(args.giveawayId, requesterLang);
          if (!result.ok) return { error: result.error || "Failed to end giveaway" };
          return { success: true, winners: result.winners };
        }
        if (action === "reroll") {
          if (!args.giveawayId) return { error: "giveawayId is required for reroll action" };
          const requesterLang = await utils.getUserLanguage(args.requesterId).catch(() => "en");
          const result = await utils.rerollGiveawayWinner(args.giveawayId, args.guildId, requesterLang);
          if (!result.ok) return { error: result.error || "Failed to reroll giveaway" };
          return { success: true, newWinner: result.newWinner };
        }
      } catch (error: any) {
        return { error: error.message ?? "Failed to manage giveaway" };
      }
    },
    create_reminder: async (args: { requesterId?: string; channelId?: string; message?: string; durationMs?: number }): Promise<any> => {
      if (!args?.requesterId || !args.message || !args.durationMs) return { error: "Missing parameters" };
      if (args.durationMs < 30000) return { error: "Minimum reminder time is 30 seconds" };
      if (args.durationMs > 2592000000) return { error: "Maximum reminder time is 30 days" };
      const now = Date.now();
      const remindAt = now + args.durationMs;
      await db.query("INSERT INTO reminders SET ?", [{
        user_id: args.requesterId,
        channel_id: args.channelId ?? null,
        message: args.message,
        remind_at: remindAt,
        created_at: now,
        status: "pending"
      }]);
      return { success: true, remindAt };
    },
    check_local_model: async (): Promise<any> => {
      const aiManager = (await import("../../ai")).default;
      const health = await aiManager.checkOllamaHealth();
      return {
        online: health.online,
        error: health.error,
        models: health.models,
        configured: {
          chat: aiManager.OllamaChatModel,
          moderation: aiManager.OllamaModerationModel,
          vision: aiManager.OllamaVisionModel
        }
      };
    },
    list_local_models: async (): Promise<any> => {
      const aiManager = (await import("../../ai")).default;
      const models = await aiManager.getOllamaModels();
      if (!models.length) return { models: [], message: "No models available or Ollama is offline" };
      return { models };
    }
};

export default guildToolsFunctions;
