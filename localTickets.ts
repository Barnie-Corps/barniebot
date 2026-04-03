import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, GuildMember, PermissionFlagsBits, TextChannel } from "discord.js";
import client from ".";
import db from "./mysql/database";
import type { LocalTicket, LocalTicketCloseTexts, LocalTicketConfig, LocalTicketCreateTexts } from "./types/tickets";
import * as fs from "fs";
import * as path from "path";

const parseRoleIds = (value: any): string[] => {
    if (!value) return [];
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (!Array.isArray(parsed)) return [];
        return parsed.map(item => String(item ?? "").trim()).filter(Boolean);
    } catch {
        return [];
    }
};

export const getLocalTicketConfig = async (guildId: string): Promise<LocalTicketConfig | null> => {
    const rows = await db.query("SELECT * FROM local_ticket_configs WHERE guild_id = ?", [guildId]) as unknown as any[];
    if (!rows?.[0]) return null;
    return {
        guild_id: rows[0].guild_id,
        enabled: Boolean(rows[0].enabled),
        category_id: rows[0].category_id,
        transcripts_channel_id: rows[0].transcripts_channel_id || null,
        support_role_ids: parseRoleIds(rows[0].support_role_ids),
        created_at: Number(rows[0].created_at ?? 0),
        updated_at: Number(rows[0].updated_at ?? 0)
    };
};

export const getOpenLocalTicketByUser = async (guildId: string, creatorId: string): Promise<LocalTicket | null> => {
    const rows = await db.query("SELECT * FROM local_tickets WHERE guild_id = ? AND creator_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1", [guildId, creatorId]) as unknown as any[];
    return rows?.[0] ?? null;
};

export const getLocalTicketByChannel = async (channelId: string): Promise<LocalTicket | null> => {
    const rows = await db.query("SELECT * FROM local_tickets WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1", [channelId]) as unknown as any[];
    return rows?.[0] ?? null;
};

export const canManageLocalTicket = (member: GuildMember, ticket: LocalTicket, config: LocalTicketConfig | null): boolean => {
    if (member.id === ticket.creator_id) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    if (!config) return false;
    return member.roles.cache.some(role => config.support_role_ids.includes(role.id));
};

const fetchAllMessages = async (channel: TextChannel) => {
    const collected: any[] = [];
    let before: string | undefined;
    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, before });
        if (!batch.size) break;
        collected.push(...batch.values());
        before = batch.last()?.id;
        if (batch.size < 100) break;
    }
    return collected.reverse();
};

const buildTranscriptFiles = async (ticket: LocalTicket, channel: TextChannel, closedByTag: string) => {
    const messages = await fetchAllMessages(channel);
    const user = await client.users.fetch(ticket.creator_id).catch(() => null);
    const closedAt = Date.now();
    const durationMs = closedAt - Number(ticket.created_at || closedAt);
    const hours = Math.floor(durationMs / 3600000);
    const minutes = Math.floor((durationMs % 3600000) / 60000);
    const durationText = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    let textTranscript = `Local Ticket #${ticket.id} - Transcript\n`;
    textTranscript += `Guild ID: ${ticket.guild_id}\n`;
    textTranscript += `User: ${user ? `${user.tag} (${user.id})` : ticket.creator_id}\n`;
    textTranscript += `Created: ${new Date(ticket.created_at).toISOString()}\n`;
    textTranscript += `Closed: ${new Date(closedAt).toISOString()}\n`;
    textTranscript += `Duration: ${durationText}\n`;
    textTranscript += `Closed by: ${closedByTag}\n`;
    textTranscript += `Initial Message: ${ticket.initial_message}\n`;
    textTranscript += `\n${"=".repeat(50)}\n\n`;
    let messagesHtml = "";
    for (const msg of messages) {
        const timestampIso = new Date(msg.createdTimestamp).toISOString();
        const timestampLocal = new Date(msg.createdTimestamp).toLocaleString();
        const displayName = msg.member?.displayName ?? msg.author?.displayName ?? msg.author?.username ?? "Unknown";
        const content = msg.content || (msg.attachments.size > 0 ? msg.attachments.map((att: any) => att.url).join("\n") : "[empty]");
        const safeContent = String(content)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        const safeName = String(displayName)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        textTranscript += `[${timestampIso}] ${displayName}: ${content}\n`;
        messagesHtml += `
        <div class="message">
            <div class="avatar">${safeName.charAt(0).toUpperCase() || "?"}</div>
            <div class="message-content">
                <div class="message-header">
                    <span class="username">${safeName}</span>
                    <span class="timestamp">${timestampLocal}</span>
                </div>
                <div class="message-text">${safeContent.replace(/\n/g, "<br>")}</div>
            </div>
        </div>`;
    }
    let htmlTemplate = fs.readFileSync("./transcript_placeholder.html", "utf-8");
    htmlTemplate = htmlTemplate
        .replace(/{ticketId}/g, String(ticket.id))
        .replace(/{username}/g, user?.tag ?? ticket.creator_id)
        .replace(/{userId}/g, ticket.creator_id)
        .replace(/{status}/g, "Closed")
        .replace(/{statusClass}/g, "status-closed")
        .replace(/{createdAt}/g, new Date(ticket.created_at).toLocaleString())
        .replace(/{closedAt}/g, new Date(closedAt).toLocaleString())
        .replace(/{origin}/g, `Guild: ${ticket.guild_id}`)
        .replace(/{initialMessage}/g, ticket.initial_message)
        .replace(/{messages}/g, messagesHtml);
    const textPath = path.join(process.cwd(), `local-ticket-${ticket.id}.txt`);
    const htmlPath = path.join(process.cwd(), `local-ticket-${ticket.id}.html`);
    fs.writeFileSync(textPath, textTranscript);
    fs.writeFileSync(htmlPath, htmlTemplate);
    return { textPath, htmlPath, messageCount: messages.length, durationText, user };
};

export const createLocalTicket = async (guildId: string, creatorId: string, initialMessage: string, texts?: LocalTicketCreateTexts) => {
    const guild = await client.guilds.fetch(guildId);
    const config = await getLocalTicketConfig(guildId);
    if (!config || !config.enabled) return { error: texts?.not_enabled_error ?? "Local ticket system is not enabled." };
    const category = guild.channels.cache.get(config.category_id);
    if (!category || category.type !== ChannelType.GuildCategory) return { error: texts?.invalid_category_error ?? "Ticket category is not configured correctly." };
    const existing = await getOpenLocalTicketByUser(guildId, creatorId);
    if (existing) return { error: texts?.already_open_error ?? "You already have an open ticket.", ticket: existing };
    const creator = await guild.members.fetch(creatorId);
    const insert: any = await db.query("INSERT INTO local_tickets SET ?", [{
        guild_id: guildId,
        channel_id: "pending",
        creator_id: creatorId,
        opener_message_id: null,
        initial_message: initialMessage,
        status: "open",
        created_at: Date.now(),
        closed_at: null,
        closed_by: null
    }]);
    const ticketId = Number(insert.insertId);
    const channelName = `ticket-${ticketId}`;
    const permissionOverwrites: any[] = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: creatorId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
        },
        {
            id: client.user!.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages]
        }
    ];
    for (const roleId of config.support_role_ids) {
        permissionOverwrites.push({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageMessages]
        });
    }
    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: config.category_id,
        topic: `Local ticket #${ticketId} • User ${creator.user.tag} (${creatorId})`,
        permissionOverwrites
    });
    await db.query("UPDATE local_tickets SET channel_id = ? WHERE id = ?", [channel.id, ticketId]);
    const embed = new EmbedBuilder()
        .setColor("Blue")
        .setTitle(`${texts?.title ?? "Ticket"} #${ticketId}`)
        .setDescription(initialMessage)
        .addFields(
            { name: texts?.user ?? "User", value: `<@${creatorId}>`, inline: true },
            { name: texts?.status ?? "Status", value: texts?.open ?? "Open", inline: true }
        )
        .setTimestamp();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`localticket_close-${ticketId}-${creatorId}`)
            .setLabel(texts?.close_button ?? "Close Ticket")
            .setStyle(ButtonStyle.Danger)
    );
    const opener = await channel.send({
        content: config.support_role_ids.length > 0 ? config.support_role_ids.map(roleId => `<@&${roleId}>`).join(" ") : `<@${creatorId}>`,
        embeds: [embed],
        components: [row]
    });
    await db.query("UPDATE local_tickets SET opener_message_id = ? WHERE id = ?", [opener.id, ticketId]);
    return { success: true, ticketId, channelId: channel.id };
};

export const closeLocalTicket = async (ticketId: number, closerId: string, closerTag: string, texts?: LocalTicketCloseTexts) => {
    const rows = await db.query("SELECT * FROM local_tickets WHERE id = ?", [ticketId]) as unknown as LocalTicket[];
    const ticket = rows?.[0];
    if (!ticket) return { error: texts?.not_found_error ?? "Ticket not found." };
    if (ticket.status === "closed") return { error: texts?.already_closed_error ?? "Ticket is already closed." };
    const channel = await client.channels.fetch(ticket.channel_id).catch(() => null) as TextChannel | null;
    if (!channel) return { error: texts?.channel_not_found_error ?? "Ticket channel not found." };
    const config = await getLocalTicketConfig(ticket.guild_id);
    const transcript = await buildTranscriptFiles(ticket, channel, `${closerTag} (${closerId})`);
    const transcriptsChannel = config?.transcripts_channel_id
        ? await client.channels.fetch(config.transcripts_channel_id).catch(() => null) as TextChannel | null
        : null;
    if (transcriptsChannel) {
        const transcriptEmbed = new EmbedBuilder()
            .setColor("Orange")
            .setTitle(`${texts?.transcript_title ?? "Local Ticket"} #${ticket.id}`)
            .setDescription(texts?.transcript_description ? texts.transcript_description.replace("{closer}", closerTag) : `Closed by ${closerTag}`)
            .addFields(
                { name: texts?.transcript_user ?? "User", value: transcript.user ? `${transcript.user.tag} (${transcript.user.id})` : ticket.creator_id, inline: true },
                { name: texts?.transcript_messages ?? "Messages", value: String(transcript.messageCount), inline: true },
                { name: texts?.transcript_duration ?? "Duration", value: transcript.durationText, inline: true }
            )
            .setTimestamp();
        await transcriptsChannel.send({
            embeds: [transcriptEmbed],
            files: [
                new AttachmentBuilder(transcript.textPath, { name: `local-ticket-${ticket.id}.txt` }),
                new AttachmentBuilder(transcript.htmlPath, { name: `local-ticket-${ticket.id}.html` })
            ]
        });
    }
    await db.query("UPDATE local_tickets SET status = 'closed', closed_at = ?, closed_by = ? WHERE id = ?", [Date.now(), closerId, ticket.id]);
    try {
        if (ticket.opener_message_id) {
            const opener = await channel.messages.fetch(ticket.opener_message_id);
            const updated = opener.embeds[0] ? EmbedBuilder.from(opener.embeds[0]).setColor("Red") : new EmbedBuilder().setColor("Red");
            updated.setTitle(`Ticket #${ticket.id} - CLOSED`);
            await opener.edit({ embeds: [updated], components: [] });
        }
    } catch {}
    await channel.setName(`closed-ticket-${ticket.id}`).catch(() => null);
    await channel.permissionOverwrites.edit(ticket.creator_id, { SendMessages: false }).catch(() => null);
    const deleteRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`localticket_delete-${ticket.id}`)
            .setLabel(texts?.delete_button ?? "Delete Channel")
            .setStyle(ButtonStyle.Danger)
    );
    await channel.send({
        embeds: [
            new EmbedBuilder()
                .setColor("Red")
                .setTitle(`${texts?.closed_title ?? "Ticket"} #${ticket.id}`)
                .setDescription(texts?.closed_description ? texts.closed_description.replace("{closer}", closerTag) : `Closed by ${closerTag}`)
                .setTimestamp()
        ],
        components: [deleteRow]
    });
    fs.unlinkSync(transcript.textPath);
    fs.unlinkSync(transcript.htmlPath);
    return { success: true, channelId: channel.id };
};
