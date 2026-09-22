// AI-callable tool implementations: Channel discovery, creation, editing, and messaging.
import utils, { getGuildAndMember, hasGuildPermission, isAdminStaffUser, isOwner } from "../../utils";
import client from "../..";
import { PermissionFlagsBits, PermissionsBitField, EmbedBuilder, ChannelType } from "discord.js";

const channelsFunctions = {
    list_guild_channels: async (args: { requesterId?: string; guildId?: string; type?: string; limit?: number }): Promise<any> => {
      if (!args?.requesterId || !args.guildId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const limit = Math.max(1, Math.min(args.limit ?? 100, 200));
      const typeKey = args.type ? args.type.toLowerCase() : "";
      const filtered = Array.from(guild.channels.cache.values())
        .filter((ch: any) => {
          if (!typeKey) return true;
          const typeName = String(ChannelType[ch.type as keyof typeof ChannelType] ?? "").toLowerCase();
          return typeName === typeKey || typeName.replace("guild", "") === typeKey;
        })
        .slice(0, limit)
        .map((ch: any) => ({
          id: ch.id,
          name: ch.name,
          type: ChannelType[ch.type as keyof typeof ChannelType] ?? String(ch.type),
          typeId: ch.type,
          parentId: ch.parentId ?? null,
          topic: "topic" in ch ? ch.topic ?? null : null,
          nsfw: "nsfw" in ch ? Boolean(ch.nsfw) : false,
          position: typeof ch.rawPosition === "number" ? ch.rawPosition : null
        }));
      return { channels: filtered };
    },
    search_guild_channels: async (args: { requesterId?: string; guildId?: string; query?: string; limit?: number }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.query) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
      const term = args.query.toLowerCase();
      const matches = Array.from(guild.channels.cache.values())
        .filter((ch: any) => String(ch.name || "").toLowerCase().includes(term))
        .slice(0, limit)
        .map((ch: any) => ({
          id: ch.id,
          name: ch.name,
          type: ChannelType[ch.type as keyof typeof ChannelType] ?? String(ch.type),
          typeId: ch.type,
          parentId: ch.parentId ?? null,
          topic: "topic" in ch ? ch.topic ?? null : null,
          nsfw: "nsfw" in ch ? Boolean(ch.nsfw) : false,
          position: typeof ch.rawPosition === "number" ? ch.rawPosition : null
        }));
      return { channels: matches };
    },
    get_channel_info: async (args: { requesterId?: string; guildId?: string; channelId?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel) return { error: "Channel not found" };
      return {
        channel: {
          id: channel.id,
          name: channel.name,
          type: ChannelType[channel.type as keyof typeof ChannelType] ?? String(channel.type),
          typeId: channel.type,
          parentId: channel.parentId ?? null,
          topic: "topic" in channel ? channel.topic ?? null : null,
          nsfw: "nsfw" in channel ? Boolean(channel.nsfw) : false,
          position: typeof channel.rawPosition === "number" ? channel.rawPosition : null,
          rateLimitPerUser: "rateLimitPerUser" in channel ? channel.rateLimitPerUser ?? null : null,
          bitrate: "bitrate" in channel ? channel.bitrate ?? null : null,
          userLimit: "userLimit" in channel ? channel.userLimit ?? null : null
        }
      };
    },
    create_guild_channel: async (args: { requesterId?: string; guildId?: string; name: string; type: string; parentId?: string; topic?: string; nsfw?: boolean; rateLimitPerUser?: number; bitrate?: number; userLimit?: number; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.name || !args.type) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = client.guilds.cache.get(args.guildId)!;
      const member = guildInfo.member as any;
      const hasPerm = hasGuildPermission(member, PermissionFlagsBits.ManageChannels);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const botMember = guild.members.me;
      if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageChannels)) return { error: "Bot lacks ManageChannels permission" };
      const typeKey = args.type.toLowerCase();
      const typeMap: Record<string, ChannelType> = {
        text: ChannelType.GuildText,
        voice: ChannelType.GuildVoice,
        category: ChannelType.GuildCategory,
        announcement: ChannelType.GuildAnnouncement,
        forum: ChannelType.GuildForum,
        stage: ChannelType.GuildStageVoice
      };
      const channelType = typeMap[typeKey] as any;
      if (!channelType && args.type !== "text") return { error: "Unsupported channel type" };
      const channel = await guild.channels.create({
        name: args.name,
        type: typeMap[typeKey] as any,
        parent: args.parentId ?? null,
        topic: args.topic,
        nsfw: args.nsfw,
        rateLimitPerUser: args.rateLimitPerUser,
        bitrate: args.bitrate,
        userLimit: args.userLimit,
        reason: args.reason
      });
      return { channel: { id: channel.id, name: channel.name, type: channel.type } };
    },
    edit_guild_channel: async (args: { requesterId?: string; guildId?: string; channelId: string; name?: string; topic?: string; nsfw?: boolean; rateLimitPerUser?: number; parentId?: string; position?: number; userLimit?: number; bitrate?: number; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId) return { error: "Missing parameters" };
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
      const channel = guild.channels.cache.get(args.channelId);
      if (!channel) return { error: "Channel not found" };
      const updated = await channel.edit({
        name: args.name,
        topic: args.topic,
        nsfw: args.nsfw,
        rateLimitPerUser: args.rateLimitPerUser,
        parent: args.parentId ?? undefined,
        position: args.position,
        userLimit: args.userLimit,
        bitrate: args.bitrate,
        reason: args.reason
      });
      return { channel: { id: updated.id, name: updated.name, type: updated.type } };
    },
    delete_guild_channel: async (args: { requesterId?: string; guildId?: string; channelId: string; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId) return { error: "Missing parameters" };
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
      const channel = guild.channels.cache.get(args.channelId);
      if (!channel) return { error: "Channel not found" };
      await channel.delete(args.reason);
      return { success: true };
    },
    create_thread: async (args: { requesterId?: string; guildId?: string; channelId: string; name: string; type?: string; autoArchiveDuration?: number; reason?: string }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.name) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
      if (guildInfo.error) return { error: guildInfo.error };
      const guild = guildInfo.guild as any;
      const member = guildInfo.member as any;
      const typeKey = (args.type ?? "public").toLowerCase();
      const requiredPerm = typeKey === "private" ? PermissionFlagsBits.CreatePrivateThreads : PermissionFlagsBits.CreatePublicThreads;
      const hasPerm = hasGuildPermission(member, requiredPerm);
      if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel || !channel.threads) return { error: "Channel does not support threads" };
      const threadTypeMap: Record<string, ChannelType> = {
        public: ChannelType.PublicThread,
        private: ChannelType.PrivateThread,
        announcement: ChannelType.AnnouncementThread
      };
      const threadType = threadTypeMap[typeKey];
      if (!threadType) return { error: "Unsupported thread type" };
      const thread = await channel.threads.create({
        name: args.name,
        autoArchiveDuration: args.autoArchiveDuration,
        type: threadType,
        reason: args.reason
      });
      return { thread: { id: thread.id, name: thread.name, type: thread.type } };
    },
    send_email: async (args: { to?: string; subject?: string; body?: string; content?: string; isHtml?: boolean }): Promise<any> => {
      const to = typeof args?.to === "string" ? args.to.trim() : "";
      const subject = typeof args?.subject === "string" ? args.subject.trim() : "";
      const body = typeof args?.body === "string"
        ? args.body
        : (typeof args?.content === "string" ? args.content : "");
      if (!to || !subject || !body) return { error: "Missing parameters" };
      try {
        const isHtml = Boolean(args?.isHtml);
        await (isHtml ? utils.sendEmail(to, subject, "", body) : utils.sendEmail(to, subject, body));
        return { success: true };
      }
      catch (error: any) {
        return { error: "Failed to send email" };
      }
    },
    get_current_channel_info: async (message: any): Promise<any> => {
      if (!message.guild || !message.channel) return { error: "Not in a guild channel" };
      const channel = message.channel as any;
      return {
        channel: { id: channel.id, name: channel.name, type: ChannelType[channel.type as keyof typeof ChannelType] ?? String(channel.type) }
      };
    },
    send_channel_message: async (args: { requesterId?: string; guildId?: string; channelId: string; content: string; sourceGuildId?: string | null }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.content) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const staff = await utils.isStaff(args.requesterId);
      const isCrossGuild = !args.sourceGuildId || args.sourceGuildId !== args.guildId;
      if (isCrossGuild && !owner && !staff) return { error: "Requester is not authorized to message outside the current guild" };
      let guild: any = null;
      let member: any = null;
      if (!isCrossGuild) {
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        guild = guildInfo.guild as any;
        member = guildInfo.member as any;
      } else {
        guild = await client.guilds.fetch(args.guildId).catch(() => null);
        if (!guild) return { error: "Guild not found" };
      }
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel || !channel.isTextBased?.()) return { error: "Channel not text-based" };
      if (!isCrossGuild) {
        const perms = channel.permissionsFor(member);
        const hasPerm = !!perms && perms.has(PermissionFlagsBits.SendMessages);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const botPerms = channel.permissionsFor(guild.members.me);
      if (!botPerms || !botPerms.has(PermissionFlagsBits.SendMessages)) return { error: "Bot lacks SendMessages permission" };
      const sent = await channel.send({ content: args.content });
      return { message: { id: sent.id, channelId: sent.channelId } };
    },
    send_channel_embed: async (args: { requesterId?: string; guildId?: string; channelId: string; embed: any; content?: string; sourceGuildId?: string | null }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.embed) return { error: "Missing parameters" };
      const owner = isOwner(args.requesterId) === true;
      const adminStaff = await isAdminStaffUser(args.requesterId);
      const staff = await utils.isStaff(args.requesterId);
      const isCrossGuild = !args.sourceGuildId || args.sourceGuildId !== args.guildId;
      if (isCrossGuild && !owner && !staff) return { error: "Requester is not authorized to message outside the current guild" };
      let guild: any = null;
      let member: any = null;
      if (!isCrossGuild) {
        const guildInfo = await getGuildAndMember(args.guildId, args.requesterId);
        if (guildInfo.error) return { error: guildInfo.error };
        guild = guildInfo.guild as any;
        member = guildInfo.member as any;
      } else {
        guild = await client.guilds.fetch(args.guildId).catch(() => null);
        if (!guild) return { error: "Guild not found" };
      }
      const channel = guild.channels.cache.get(args.channelId) as any;
      if (!channel || !channel.isTextBased?.()) return { error: "Channel not text-based" };
      if (!isCrossGuild) {
        const perms = channel.permissionsFor(member);
        const hasPerm = !!perms && perms.has(PermissionFlagsBits.SendMessages);
        if (!owner && !adminStaff && !hasPerm) return { error: "Requester is not authorized" };
      }
      const botPerms = channel.permissionsFor(guild.members.me);
      if (!botPerms || !botPerms.has(PermissionFlagsBits.SendMessages)) return { error: "Bot lacks SendMessages permission" };
      const embedBuilder = new EmbedBuilder();
      if (args.embed.title) embedBuilder.setTitle(String(args.embed.title));
      if (args.embed.description) embedBuilder.setDescription(String(args.embed.description));
      if (args.embed.url) embedBuilder.setURL(String(args.embed.url));
      if (args.embed.timestamp) embedBuilder.setTimestamp(new Date(args.embed.timestamp));
      if (args.embed.footer?.text) embedBuilder.setFooter({ text: String(args.embed.footer.text), iconURL: args.embed.footer.icon_url ? String(args.embed.footer.icon_url) : undefined });
      if (args.embed.thumbnail) embedBuilder.setThumbnail(String(args.embed.thumbnail));
      if (args.embed.image) embedBuilder.setImage(String(args.embed.image));
      if (args.embed.author?.name) embedBuilder.setAuthor({ name: String(args.embed.author.name), iconURL: args.embed.author.icon_url ? String(args.embed.author.icon_url) : undefined, url: args.embed.author.url ? String(args.embed.author.url) : undefined });
      if (Array.isArray(args.embed.fields)) {
        embedBuilder.addFields(args.embed.fields.map((f: any) => ({ name: String(f.name), value: String(f.value), inline: !!f.inline })));
      }
      if (args.embed.color !== undefined && args.embed.color !== null) {
        if (typeof args.embed.color === "number") embedBuilder.setColor(args.embed.color);
        if (typeof args.embed.color === "string") {
          const hex = args.embed.color.startsWith("#") ? args.embed.color.slice(1) : args.embed.color;
          const num = parseInt(hex, 16);
          if (!Number.isNaN(num)) embedBuilder.setColor(num);
        }
      }
      const sent = await channel.send({ content: args.content ?? undefined, embeds: [embedBuilder] });
      return { message: { id: sent.id, channelId: sent.channelId } };
    },
    set_channel_permissions: async (args: { requesterId?: string; guildId?: string; channelId: string; targetId: string; allow?: string[]; deny?: string[] }): Promise<any> => {
      if (!args?.requesterId || !args.guildId || !args.channelId || !args.targetId) return { error: "Missing parameters" };
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
      let allow: bigint | undefined;
      let deny: bigint | undefined;
      try {
        if (args.allow && args.allow.length > 0) allow = PermissionsBitField.resolve(args.allow as any);
        if (args.deny && args.deny.length > 0) deny = PermissionsBitField.resolve(args.deny as any);
      } catch {
        return { error: "Invalid permission names" };
      }
      await channel.permissionOverwrites.edit(args.targetId, { allow, deny });
      return { success: true };
    },
};

export default channelsFunctions;
