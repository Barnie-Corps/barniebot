// AI-callable tool implementations: Member and role management: lookup, roles, kicks, bans, timeouts, nicknames, voice moves.
import { getGuildAndMember, hasGuildPermission, isAdminStaffUser, isOwner } from "../../utils";
import db from "../../mysql/database";
import client from "../..";
import { PermissionFlagsBits, PermissionsBitField, ChannelType } from "discord.js";

const membersFunctions = {
    send_dm: async (args: { userId: string; content: string; }): Promise<any> => {
      if (!args.userId || !args.content) return { error: "Missing parameters" };
      let user;
      try {
        user = await client.users.fetch(args.userId);
      } catch (error) {
        return { error: "User not found" };
      }
      try {
        await user.send(args.content);
        return { success: true };
      } catch (error) {
        return { error: "Failed to send DM" };
      }
    },
    kick_member: async (args: { guildId: string; memberId: string; reason: string }): Promise<any> => {
      if (!args.guildId || !args.memberId || !args.reason) return { error: "Missing parameters" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      let member = guild.members.cache.get(args.memberId);
      if (!member) return { error: "Member not found" };
      try {
        await member.kick(args.reason);
        return { success: true };
      } catch (error) {
        return { error: "Failed to kick member" };
      }
    },
    check_vip_status: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [args.userId]);
      if (foundVip.length > 0) {
        return { isVip: true, user: foundVip[0] };
      }
      return { isVip: false };
    },
    list_guild_roles: async (args: { requesterId?: string; guildId?: string; limit?: number }): Promise<any> => {
      if (!args?.requesterId || !args.guildId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageRoles);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const limit = Math.max(1, Math.min(args.limit ?? 250, 250));
      const roles = Array.from(guild.roles.cache.values())
        .slice(0, limit)
        .map((role: any) => ({
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
          hoist: role.hoist,
          mentionable: role.mentionable,
          managed: role.managed,
          permissions: role.permissions.toArray()
        }));
      return { roles };
    },
    get_role_info: async (args: { requesterId?: string; guildId?: string; roleId?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.roleId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageRoles);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const role = guild.roles.cache.get(args.roleId);
      if (!role) return { error: "Role not found" };
      return {
        role: {
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
          hoist: role.hoist,
          mentionable: role.mentionable,
          managed: role.managed,
          permissions: role.permissions.toArray(),
          createdAt: role.createdTimestamp
        }
      };
    },
    create_role: async (args: { requesterId?: string; guildId?: string; name: string; color?: string; hoist?: boolean; mentionable?: boolean; permissions?: string[]; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.name) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = client.guilds.cache.get(args.guildId)!;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageRoles);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return { error: "Bot lacks ManageRoles permission" };
      let color: number | undefined;
      if (args.color) {
        const hex = args.color.startsWith("#") ? args.color.slice(1) : args.color;
        const num = parseInt(hex, 16);
        if (!Number.isNaN(num)) color = num;
      }
      let permissions: bigint | undefined;
      if (args.permissions && args.permissions.length > 0) {
        try {
          permissions = PermissionsBitField.resolve(args.permissions as any);
        } catch {
          return { error: "Invalid permission names" };
        }
      }
      const role = await guild.roles.create({
        name: args.name,
        color,
        hoist: args.hoist,
        mentionable: args.mentionable,
        permissions,
        reason: args.reason
      });
      return { role: { id: role.id, name: role.name, color: role.color } };
    },
    edit_role: async (args: { requesterId?: string; guildId?: string; roleId: string; name?: string; color?: string; hoist?: boolean; mentionable?: boolean; permissions?: string[]; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.roleId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageRoles);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return { error: "Bot lacks ManageRoles permission" };
      const role = guild.roles.cache.get(args.roleId);
      if (!role) return { error: "Role not found" };
      let color: number | undefined;
      if (args.color) {
        const hex = args.color.startsWith("#") ? args.color.slice(1) : args.color;
        const num = parseInt(hex, 16);
        if (!Number.isNaN(num)) color = num;
      }
      let permissions: bigint | undefined;
      if (args.permissions && args.permissions.length > 0) {
        try {
          permissions = PermissionsBitField.resolve(args.permissions as any);
        } catch {
          return { error: "Invalid permission names" };
        }
      }
      const updated = await role.edit({
        name: args.name,
        color,
        hoist: args.hoist,
        mentionable: args.mentionable,
        permissions,
        reason: args.reason
      });
      return { role: { id: updated.id, name: updated.name, color: updated.color } };
    },
    delete_role: async (args: { requesterId?: string; guildId?: string; roleId: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.roleId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageRoles);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return { error: "Bot lacks ManageRoles permission" };
      const role = guild.roles.cache.get(args.roleId);
      if (!role) return { error: "Role not found" };
      if (role.managed) return { error: "Cannot delete managed roles" };
      await role.delete(args.reason);
      return { success: true };
    },
    add_role_to_member: async (args: { requesterId?: string; guildId?: string; memberId: string; roleId: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.memberId || !args.roleId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageRoles);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return { error: "Bot lacks ManageRoles permission" };
      const targetMember = await guild.members.fetch(args.memberId).catch(() => null);
      if (!targetMember) return { error: "Member not found" };
      const role = guild.roles.cache.get(args.roleId);
      if (!role) return { error: "Role not found" };
      await targetMember.roles.add(role, args.reason);
      return { success: true };
    },
    remove_role_from_member: async (args: { requesterId?: string; guildId?: string; memberId: string; roleId: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.memberId || !args.roleId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageRoles);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return { error: "Bot lacks ManageRoles permission" };
      const targetMember = await guild.members.fetch(args.memberId).catch(() => null);
      if (!targetMember) return { error: "Member not found" };
      const role = guild.roles.cache.get(args.roleId);
      if (!role) return { error: "Role not found" };
      await targetMember.roles.remove(role, args.reason);
      return { success: true };
    },
    get_role_members: async (args: { requesterId?: string; guildId?: string; roleId: string; limit?: number }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.roleId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageRoles);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const role = guild.roles.cache.get(args.roleId);
      if (!role) return { error: "Role not found" };
      const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
      const members = Array.from(role.members.values())
        .slice(0, limit)
        .map((m: any) => ({
          id: m.id,
          username: m.user.username,
          tag: m.user.tag,
          joinedAt: m.joinedTimestamp,
          nickname: m.nickname ?? null
        }));
      return { members, count: role.members.size };
    },
    list_guild_members: async (args: { requesterId?: string; guildId?: string; limit?: number }): Promise<any> => {
      if (!args?.requesterId || !args.guildId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.KickMembers) || hasGuildPermission(member, PermissionFlagsBits.ManageGuild);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const limit = Math.max(1, Math.min(args.limit ?? 100, 1000));
      await guild.members.fetch({ limit });
      const members = Array.from(guild.members.cache.values())
        .slice(0, limit)
        .map((m: any) => ({
          id: m.id,
          username: m.user.username,
          tag: m.user.tag,
          joinedAt: m.joinedTimestamp,
          nickname: m.nickname ?? null,
          bot: m.user.bot
        }));
      return { members };
    },
    search_guild_members: async (args: { requesterId?: string; guildId?: string; query?: string; limit?: number }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.query) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.KickMembers) || hasGuildPermission(member, PermissionFlagsBits.ManageGuild);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
      const term = args.query.toLowerCase();
      await guild.members.fetch({ query: args.query, limit });
      const matches = Array.from(guild.members.cache.values())
        .filter((m: any) =>
          m.user.username.toLowerCase().includes(term) ||
          m.user.tag.toLowerCase().includes(term) ||
          (m.nickname && m.nickname.toLowerCase().includes(term))
        )
        .slice(0, limit)
        .map((m: any) => ({
          id: m.id,
          username: m.user.username,
          tag: m.user.tag,
          joinedAt: m.joinedTimestamp,
          nickname: m.nickname ?? null,
          bot: m.user.bot
        }));
      return { members: matches };
    },
    get_member_info: async (args: { requesterId?: string; guildId?: string; memberId?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.memberId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.KickMembers) || hasGuildPermission(member, PermissionFlagsBits.ManageGuild);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const targetMember = await guild.members.fetch(args.memberId).catch(() => null);
      if (!targetMember) return { error: "Member not found" };
      return {
        member: {
          id: targetMember.id,
          username: targetMember.user.username,
          tag: targetMember.user.tag,
          discriminator: targetMember.user.discriminator,
          avatar: targetMember.user.displayAvatarURL(),
          bot: targetMember.user.bot,
          joinedAt: targetMember.joinedTimestamp,
          createdAt: targetMember.user.createdTimestamp,
          nickname: targetMember.nickname ?? null,
          roles: targetMember.roles.cache.map((r: any) => ({ id: r.id, name: r.name })),
          permissions: targetMember.permissions?.toArray?.() ?? [],
          communicationDisabledUntil: targetMember.communicationDisabledUntilTimestamp ?? null,
          pending: targetMember.pending ?? false
        }
      };
    },
    ban_member: async (args: { requesterId?: string; guildId?: string; memberId: string; reason?: string; deleteMessageSeconds?: number }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.memberId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.BanMembers);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.BanMembers)) return { error: "Bot lacks BanMembers permission" };
      try {
        await guild.members.ban(args.memberId, {
          reason: args.reason ?? "No reason provided",
          deleteMessageSeconds: args.deleteMessageSeconds ?? 0
        });
        return { success: true };
      } catch (error: any) {
        return { error: error.message ?? "Failed to ban member" };
      }
    },
    unban_member: async (args: { requesterId?: string; guildId?: string; userId: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.userId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.BanMembers);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.BanMembers)) return { error: "Bot lacks BanMembers permission" };
      try {
        await guild.members.unban(args.userId, args.reason ?? "No reason provided");
        return { success: true };
      } catch (error: any) {
        return { error: error.message ?? "Failed to unban user" };
      }
    },
    timeout_member: async (args: { requesterId?: string; guildId?: string; memberId: string; durationMs: number; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.memberId || !args.durationMs) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ModerateMembers);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) return { error: "Bot lacks ModerateMembers permission" };
      const targetMember = await guild.members.fetch(args.memberId).catch(() => null);
      if (!targetMember) return { error: "Member not found" };
      const maxTimeout = 28 * 24 * 60 * 60 * 1000; // 28 days
      const duration = Math.min(args.durationMs, maxTimeout);
      try {
        await targetMember.timeout(duration, args.reason ?? "No reason provided");
        return { success: true, until: Date.now() + duration };
      } catch (error: any) {
        return { error: error.message ?? "Failed to timeout member" };
      }
    },
    remove_timeout_member: async (args: { requesterId?: string; guildId?: string; memberId: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.memberId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ModerateMembers);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) return { error: "Bot lacks ModerateMembers permission" };
      const targetMember = await guild.members.fetch(args.memberId).catch(() => null);
      if (!targetMember) return { error: "Member not found" };
      try {
        await targetMember.timeout(null, args.reason ?? "Timeout removed");
        return { success: true };
      } catch (error: any) {
        return { error: error.message ?? "Failed to remove timeout" };
      }
    },
    set_member_nickname: async (args: { requesterId?: string; guildId?: string; memberId: string; nickname?: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.memberId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageNicknames);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) return { error: "Bot lacks ManageNicknames permission" };
      const targetMember = await guild.members.fetch(args.memberId).catch(() => null);
      if (!targetMember) return { error: "Member not found" };
      try {
        await targetMember.setNickname(args.nickname ?? null, args.reason ?? "Nickname changed");
        return { success: true };
      } catch (error: any) {
        return { error: error.message ?? "Failed to set nickname" };
      }
    },
    move_member_voice: async (args: { requesterId?: string; guildId?: string; memberId: string; channelId: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.memberId || !args.channelId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.MoveMembers);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.MoveMembers)) return { error: "Bot lacks MoveMembers permission" };
      const targetMember = await guild.members.fetch(args.memberId).catch(() => null);
      if (!targetMember) return { error: "Member not found" };
      if (!targetMember.voice.channel) return { error: "Member is not in a voice channel" };
      const targetChannel = guild.channels.cache.get(args.channelId);
      if (!targetChannel) return { error: "Target channel not found" };
      if (targetChannel.type !== ChannelType.GuildVoice && targetChannel.type !== ChannelType.GuildStageVoice) {
        return { error: "Target channel is not a voice channel" };
      }
      try {
        await targetMember.voice.setChannel(targetChannel);
        return { success: true };
      } catch (error: any) {
        return { error: error.message ?? "Failed to move member" };
      }
    },
};

export default membersFunctions;
