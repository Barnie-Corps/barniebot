import { getGuildAndMember, hasGuildPermission, isAdminStaffUser, isOwner, isSystemRequester } from "../../utils";
import db from "../../mysql/database";
import client from "../..";
import { PermissionFlagsBits, ChannelType } from "discord.js";

const investigationFunctions = {
    on_guild: async (message: any): Promise<any> => {
      return { isGuild: message.guild !== null };
    },
    current_guild_info: async (message: any): Promise<any> => {
      if (!message.guild) return { error: "Not in a guild" };
      return { guild: { id: message.guild.id, name: message.guild.name, memberCount: message.guild.memberCount } };
    },
    guild_info: async (args: { guildId: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      return { guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount } };
    },
    get_member_permissions: async (args: { guildId: string; memberId: string }): Promise<any> => {
      if (!args.guildId || !args.memberId) return { error: "Missing parameters" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      let member = guild.members.cache.get(args.memberId);
      if (!member) return { error: "Member not found" };
      return { permissions: member.permissions.toArray() };
    },
    get_member_roles: async (args: { guildId: string; memberId: string }): Promise<any> => {
      if (!args.guildId || !args.memberId) return { error: "Missing parameters" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      let member = guild.members.cache.get(args.memberId);
      if (!member) return { error: "Member not found" };
      return { roles: member.roles.cache.map(r => ({ id: r.id, name: r.name })) };
    },
    get_message_context: async (args: { requesterId?: string; guildId?: string; channelId?: string; messageId?: string; limit?: number }): Promise<any> => {
      if (!args.guildId || !args.channelId || !args.messageId) return { error: "Missing parameters" };
      if (!isSystemRequester(args.requesterId)) {
        if (!args.requesterId) return { error: "Missing requesterId" };
        const owner = isOwner(args.requesterId) === true;
        const adminStaff = await isAdminStaffUser(args.requesterId);
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        const member = guildInfo.member as any;
        const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageMessages);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel || !channel.isTextBased?.()) return { error: "Channel not text-based" };
      const target = await channel.messages.fetch(args.messageId).catch(() => null);
      if (!target) return { error: "Message not found" };
      const limit = Math.max(1, Math.min(args.limit ?? 12, 20));
      const around = await channel.messages.fetch({ limit, around: args.messageId }).catch(() => null);
      const aroundList = around ? Array.from(around.values()) : [];
      const mapMsg = (m: any) => ({
        id: m.id,
        authorId: m.author?.id ?? null,
        authorTag: m.author?.tag ?? null,
        content: m.content,
        createdAt: m.createdTimestamp,
        attachments: m.attachments.map((a: any) => ({ url: a.url, name: a.name, size: a.size, contentType: a.contentType }))
      });
      return {
        guild: { id: guild.id, name: guild.name },
        channel: { id: channel.id, name: channel.name },
        message: mapMsg(target),
        around: aroundList.sort((a: any, b: any) => a.createdTimestamp - b.createdTimestamp).map(mapMsg)
      };
    },
    get_user_context: async (args: { requesterId?: string; guildId?: string; userId?: string }): Promise<any> => {
      if (!args.guildId || !args.userId) return { error: "Missing parameters" };
      if (!isSystemRequester(args.requesterId)) {
        if (!args.requesterId) return { error: "Missing requesterId" };
        const owner = isOwner(args.requesterId) === true;
        const adminStaff = await isAdminStaffUser(args.requesterId);
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        const member = guildInfo.member as any;
        const hasPerm = hasGuildPermission(member, PermissionFlagsBits.KickMembers) || hasGuildPermission(member, PermissionFlagsBits.ManageGuild);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      const user = await client.users.fetch(args.userId).catch(() => null);
      const member = await guild.members.fetch(args.userId).catch(() => null);
      return {
        user: user ? {
          id: user.id,
          tag: user.tag,
          createdAt: user.createdTimestamp,
          bot: user.bot
        } : null,
        member: member ? {
          id: member.id,
          joinedAt: member.joinedTimestamp,
          nick: member.nickname ?? null,
          roles: member.roles.cache.map((r: any) => ({ id: r.id, name: r.name })),
          permissions: member.permissions?.toArray?.() ?? [],
          communicationDisabledUntil: member.communicationDisabledUntilTimestamp ?? null
        } : null
      };
    },
    get_guild_context: async (args: { requesterId?: string; guildId?: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      if (!isSystemRequester(args.requesterId)) {
        if (!args.requesterId) return { error: "Missing requesterId" };
        const owner = isOwner(args.requesterId) === true;
        const adminStaff = await isAdminStaffUser(args.requesterId);
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        const member = guildInfo.member as any;
        const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageGuild);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      const botMember = guild.members.me;
      const canViewInvites = botMember?.permissions?.has(PermissionFlagsBits.ManageGuild);
      let invites: any[] | null = null;
      if (canViewInvites) {
        const list = await guild.invites.fetch().catch(() => null);
        invites = list ? Array.from(list.values()).slice(0, 5).map(inv => ({
          code: inv.code,
          uses: inv.uses ?? 0,
          maxUses: inv.maxUses ?? 0,
          channelId: inv.channelId,
          inviterId: inv.inviter?.id ?? null
        })) : null;
      }
      const channelCounts = {
        text: guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText).size,
        voice: guild.channels.cache.filter(ch => ch.type === ChannelType.GuildVoice).size,
        category: guild.channels.cache.filter(ch => ch.type === ChannelType.GuildCategory).size
      };
      return {
        guild: {
          id: guild.id,
          name: guild.name,
          ownerId: guild.ownerId,
          memberCount: guild.memberCount,
          createdAt: guild.createdTimestamp,
          verificationLevel: guild.verificationLevel,
          mfaLevel: guild.mfaLevel,
          features: guild.features
        },
        counts: {
          roles: guild.roles.cache.size,
          channels: guild.channels.cache.size,
          ...channelCounts
        },
        invites
      };
    },
    get_user_case_history: async (args: { requesterId?: string; guildId?: string; userId?: string; days?: number; limit?: number }): Promise<any> => {
      if (!args.guildId || !args.userId) return { error: "Missing parameters" };
      if (!isSystemRequester(args.requesterId)) {
        if (!args.requesterId) return { error: "Missing requesterId" };
        const owner = isOwner(args.requesterId) === true;
        const adminStaff = await isAdminStaffUser(args.requesterId);
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        const member = guildInfo.member as any;
        const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageMessages) || hasGuildPermission(member, PermissionFlagsBits.ModerateMembers);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const limit = Math.max(1, Math.min(args.limit ?? 10, 25));
      const days = Math.max(1, Math.min(args.days ?? 7, 30));
      const since = Date.now() - days * 24 * 60 * 60 * 1000;
      const rows = await db.query(
        "SELECT case_id, event_type, risk, status, recommended_action, recommended_actions, created_at, summary, reason, auto_action_taken FROM ai_monitor_cases WHERE guild_id = ? AND user_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?",
        [args.guildId, args.userId, since, limit]
      ) as unknown as any[];
      return {
        guildId: args.guildId,
        userId: args.userId,
        since,
        total: Array.isArray(rows) ? rows.length : 0,
        cases: Array.isArray(rows) ? rows.map(r => ({
          caseId: r.case_id,
          eventType: r.event_type,
          risk: r.risk,
          status: r.status,
          recommendedAction: r.recommended_action,
          recommendedActions: (() => {
            try { return r.recommended_actions ? JSON.parse(r.recommended_actions) : null; } catch { return null; }
          })(),
          createdAt: r.created_at,
          summary: r.summary,
          reason: r.reason,
          autoActionTaken: Boolean(r.auto_action_taken)
        })) : []
      };
    },
    get_channel_case_history: async (args: { requesterId?: string; guildId?: string; channelId?: string; hours?: number; limit?: number }): Promise<any> => {
      if (!args.guildId || !args.channelId) return { error: "Missing parameters" };
      if (!isSystemRequester(args.requesterId)) {
        if (!args.requesterId) return { error: "Missing requesterId" };
        const owner = isOwner(args.requesterId) === true;
        const adminStaff = await isAdminStaffUser(args.requesterId);
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        const member = guildInfo.member as any;
        const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageMessages) || hasGuildPermission(member, PermissionFlagsBits.ModerateMembers);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const limit = Math.max(1, Math.min(args.limit ?? 10, 25));
      const hours = Math.max(1, Math.min(args.hours ?? 24, 168));
      const since = Date.now() - hours * 60 * 60 * 1000;
      const rows = await db.query(
        "SELECT case_id, event_type, risk, status, recommended_action, recommended_actions, created_at, summary, reason, auto_action_taken, user_id, message_id FROM ai_monitor_cases WHERE guild_id = ? AND channel_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?",
        [args.guildId, args.channelId, since, limit]
      ) as unknown as any[];
      return {
        guildId: args.guildId,
        channelId: args.channelId,
        since,
        total: Array.isArray(rows) ? rows.length : 0,
        cases: Array.isArray(rows) ? rows.map(r => ({
          caseId: r.case_id,
          eventType: r.event_type,
          risk: r.risk,
          status: r.status,
          recommendedAction: r.recommended_action,
          recommendedActions: (() => {
            try { return r.recommended_actions ? JSON.parse(r.recommended_actions) : null; } catch { return null; }
          })(),
          createdAt: r.created_at,
          summary: r.summary,
          reason: r.reason,
          autoActionTaken: Boolean(r.auto_action_taken),
          userId: r.user_id ?? null,
          messageId: r.message_id ?? null
        })) : []
      };
    },
    get_guild_audit_events: async (args: { requesterId?: string; guildId?: string; actionType?: string; userId?: string; limit?: number }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      if (!isSystemRequester(args.requesterId)) {
        if (!args.requesterId) return { error: "Missing requesterId" };
        const owner = isOwner(args.requesterId) === true;
        const adminStaff = await isAdminStaffUser(args.requesterId);
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        const member = guildInfo.member as any;
        const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ViewAuditLog);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ViewAuditLog)) return { error: "Bot lacks ViewAuditLog permission" };
      const limit = Math.max(1, Math.min(args.limit ?? 10, 25));
      const typeNum = args.actionType !== undefined ? Number(args.actionType) : undefined;
      const logs = await guild.fetchAuditLogs({
        limit,
        type: Number.isFinite(typeNum) ? (typeNum as any) : undefined
      }).catch(() => null);
      if (!logs) return { error: "Unable to fetch audit logs" };
      let entries = Array.from(logs.entries.values());
      if (args.userId) entries = entries.filter(entry => entry.executor?.id === args.userId);
      return {
        guildId: guild.id,
        total: entries.length,
        entries: entries.slice(0, limit).map(entry => ({
          id: entry.id,
          action: entry.action,
          actionType: entry.actionType,
          createdAt: entry.createdTimestamp ?? null,
          executor: entry.executor ? { id: entry.executor.id, tag: entry.executor.tag } : null,
          targetId: entry.targetId ?? null,
          reason: entry.reason ?? null
        }))
      };
    },
    get_member_safety_profile: async (args: { requesterId?: string; guildId?: string; userId?: string }): Promise<any> => {
      if (!args.guildId || !args.userId) return { error: "Missing parameters" };
      if (!isSystemRequester(args.requesterId)) {
        if (!args.requesterId) return { error: "Missing requesterId" };
        const owner = isOwner(args.requesterId) === true;
        const adminStaff = await isAdminStaffUser(args.requesterId);
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        const member = guildInfo.member as any;
        const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageMessages) || hasGuildPermission(member, PermissionFlagsBits.ModerateMembers);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      const user = await client.users.fetch(args.userId).catch(() => null);
      const member = await guild.members.fetch(args.userId).catch(() => null);
      const warningsRows = await db.query("SELECT COUNT(*) as total, SUM(CASE WHEN active = TRUE THEN 1 ELSE 0 END) as active FROM global_warnings WHERE userid = ?", [args.userId]) as unknown as any[];
      const recentCasesRows = await db.query(
        "SELECT case_id, risk, event_type, created_at FROM ai_monitor_cases WHERE guild_id = ? AND user_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 10",
        [args.guildId, args.userId, Date.now() - 7 * 24 * 60 * 60 * 1000]
      ) as unknown as any[];
      const now = Date.now();
      const accountAgeDays = user?.createdTimestamp ? Math.floor((now - user.createdTimestamp) / (24 * 60 * 60 * 1000)) : null;
      const joinedAgeDays = member?.joinedTimestamp ? Math.floor((now - member.joinedTimestamp) / (24 * 60 * 60 * 1000)) : null;
      const riskCounts = { low: 0, medium: 0, high: 0 };
      if (Array.isArray(recentCasesRows)) {
        for (const row of recentCasesRows) {
          if (row?.risk === "high") riskCounts.high += 1;
          else if (row?.risk === "medium") riskCounts.medium += 1;
          else riskCounts.low += 1;
        }
      }
      return {
        guildId: args.guildId,
        user: user ? { id: user.id, tag: user.tag, bot: user.bot } : { id: args.userId, tag: null, bot: null },
        accountAgeDays,
        joinedAgeDays,
        warnings: {
          total: Number(warningsRows?.[0]?.total ?? 0),
          active: Number(warningsRows?.[0]?.active ?? 0)
        },
        moderationState: member ? {
          communicationDisabledUntil: member.communicationDisabledUntilTimestamp ?? null,
          roles: member.roles.cache.map((r: any) => ({ id: r.id, name: r.name }))
        } : null,
        recentCases: {
          total: Array.isArray(recentCasesRows) ? recentCasesRows.length : 0,
          risks: riskCounts,
          latest: Array.isArray(recentCasesRows) ? recentCasesRows.map(row => ({
            caseId: row.case_id,
            eventType: row.event_type,
            risk: row.risk,
            createdAt: row.created_at
          })) : []
        }
      };
    },
    get_monitor_entity_profile: async (args: { requesterId?: string; guildId?: string; entityType?: string; entityValue?: string }): Promise<any> => {
      if (!args.guildId || !args.entityType || !args.entityValue) return { error: "Missing parameters" };
      const entityType = String(args.entityType).toLowerCase();
      if (!["user", "channel", "domain"].includes(entityType)) return { error: "Invalid entityType" };
      if (!isSystemRequester(args.requesterId)) {
        if (!args.requesterId) return { error: "Missing requesterId" };
        const owner = isOwner(args.requesterId) === true;
        const adminStaff = await isAdminStaffUser(args.requesterId);
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        const member = guildInfo.member as any;
        const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageMessages) || hasGuildPermission(member, PermissionFlagsBits.ModerateMembers);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const entityKey = `${entityType}:${String(args.entityValue).toLowerCase()}`;
      try {
        const rows = await db.query(
          "SELECT guild_id, entity_key, entity_type, risk_score, flag_count, action_count, false_positive_count, last_flag_at, last_action_at, updated_at FROM ai_monitor_entity_stats WHERE guild_id = ? AND entity_key = ? LIMIT 1",
          [args.guildId, entityKey]
        ) as unknown as any[];
        if (!rows?.[0]) return { entityType, entityValue: args.entityValue, exists: false };
        const row = rows[0];
        return {
          exists: true,
          guildId: row.guild_id,
          entityKey: row.entity_key,
          entityType: row.entity_type,
          entityValue: args.entityValue,
          riskScore: Number(row.risk_score ?? 0),
          flagCount: Number(row.flag_count ?? 0),
          actionCount: Number(row.action_count ?? 0),
          falsePositiveCount: Number(row.false_positive_count ?? 0),
          lastFlagAt: row.last_flag_at ?? null,
          lastActionAt: row.last_action_at ?? null,
          updatedAt: row.updated_at ?? null
        };
      } catch (error: any) {
        return { error: error?.message || String(error) };
      }
    },
};

export default investigationFunctions;
