import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, Guild, GuildMember, Invite, Message, PartialGuildMember, TextChannel } from "discord.js";
import db from "../mysql/database";
import NVIDIAModels from "../NVIDIAModels";
import Log from "../Log";

type MonitorConfig = {
    guild_id: string;
    enabled: boolean;
    logs_channel: string;
    allow_actions: boolean;
    analyze_potentially: boolean;
};

type TriageResult = {
    suspicious: boolean;
    risk: "low" | "medium" | "high";
    summary: string;
    reason: string;
    confidence: number;
};

type ReviewResult = {
    suspicious: boolean;
    risk: "low" | "medium" | "high";
    summary: string;
    reason: string;
    recommended_action: "notify" | "warn" | "timeout" | "kick" | "ban" | "delete_message";
    action_duration_ms?: number;
    delete_message?: boolean;
    confidence: number;
};

export default class AiMonitorManager {
    private rateLimits = new Map<string, { windowStart: number; count: number }>();
    private joinBurst = new Map<string, { windowStart: number; count: number }>();
    private recentAlertedMessages = new Map<string, number>();

    constructor(private client: Client) {}

    private async getConfig(guildId: string): Promise<MonitorConfig | null> {
        const rows = await db.query("SELECT * FROM ai_monitor_configs WHERE guild_id = ?", [guildId]) as unknown as any[];
        if (!rows || !rows[0]) return null;
        return {
            guild_id: rows[0].guild_id,
            enabled: Boolean(rows[0].enabled),
            logs_channel: rows[0].logs_channel,
            allow_actions: Boolean(rows[0].allow_actions),
            analyze_potentially: Boolean(rows[0].analyze_potentially)
        };
    }

    private canProcess(guildId: string): boolean {
        const now = Date.now();
        const windowMs = 60000;
        const limit = 50;
        const existing = this.rateLimits.get(guildId);
        if (!existing) {
            this.rateLimits.set(guildId, { windowStart: now, count: 1 });
            return true;
        }
        if (now - existing.windowStart > windowMs) {
            this.rateLimits.set(guildId, { windowStart: now, count: 1 });
            return true;
        }
        if (existing.count >= limit) return false;
        existing.count += 1;
        return true;
    }

    private parseJson<T>(text: string, fallback: T): T {
        if (!text) return fallback;
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start === -1 || end === -1 || end <= start) return fallback;
        const candidate = text.slice(start, end + 1);
        try {
            return JSON.parse(candidate) as T;
        } catch {
            return fallback;
        }
    }

    private async getRecentHistory(guildId: string, userId?: string | null) {
        if (!userId) return [];
        const since = Date.now() - 24 * 60 * 60 * 1000;
        const rows = await db.query(
            "SELECT case_id, event_type, risk, recommended_action, created_at, summary FROM ai_monitor_cases WHERE guild_id = ? AND user_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 5",
            [guildId, userId, since]
        ) as unknown as any[];
        return Array.isArray(rows) ? rows.map(r => ({
            caseId: r.case_id,
            eventType: r.event_type,
            risk: r.risk,
            recommendedAction: r.recommended_action,
            createdAt: r.created_at,
            summary: r.summary
        })) : [];
    }

    private async triage(eventType: string, data: any): Promise<TriageResult> {
        const prompt = JSON.stringify({
            role: "triage",
            instructions: "Return JSON only with keys: suspicious(boolean), risk(\"low\"|\"medium\"|\"high\"), summary(string), reason(string), confidence(number 0-1).",
            eventType,
            data
        });
        const response = await NVIDIAModels.GetModelChatResponse([{ role: "user", content: prompt }], 8000, "monitor_small", false);
        return this.parseJson<TriageResult>(response.content, {
            suspicious: false,
            risk: "low",
            summary: "not suspicious",
            reason: "",
            confidence: 0
        });
    }

    private async review(eventType: string, data: any): Promise<ReviewResult> {
        const prompt = JSON.stringify({
            role: "review",
            instructions: "Return JSON only with keys: suspicious(boolean), risk(\"low\"|\"medium\"|\"high\"), summary(string), reason(string), recommended_action(\"notify\"|\"warn\"|\"timeout\"|\"kick\"|\"ban\"|\"delete_message\"), action_duration_ms(optional number), delete_message(optional boolean), confidence(number 0-1).",
            eventType,
            data
        });
        const response = await NVIDIAModels.GetModelChatResponse([{ role: "user", content: prompt }], 12000, "monitor_large", false);
        return this.parseJson<ReviewResult>(response.content, {
            suspicious: false,
            risk: "low",
            summary: "not suspicious",
            reason: "",
            recommended_action: "notify",
            confidence: 0
        });
    }

    private async createCase(params: {
        guildId: string;
        eventType: string;
        userId?: string | null;
        channelId?: string | null;
        messageId?: string | null;
        summary: string;
        risk: string;
        recommended_action: string;
        action_payload: any;
        allow_actions: boolean;
        auto_action_taken: boolean;
        reason: string;
        confidence: number | null;
    }): Promise<string> {
        const caseId = `case_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const now = Date.now();
        await db.query("INSERT INTO ai_monitor_cases SET ?", [{
            case_id: caseId,
            guild_id: params.guildId,
            event_type: params.eventType,
            user_id: params.userId ?? null,
            channel_id: params.channelId ?? null,
            message_id: params.messageId ?? null,
            summary: params.summary,
            risk: params.risk,
            recommended_action: params.recommended_action,
            action_payload: params.action_payload ? JSON.stringify(params.action_payload) : null,
            status: "open",
            created_at: now,
            updated_at: now,
            allow_actions: params.allow_actions,
            auto_action_taken: params.auto_action_taken,
            reason: params.reason,
            confidence: params.confidence
        }]);
        return caseId;
    }

    private async updateCaseLog(caseId: string, channelId: string, messageId: string) {
        await db.query("UPDATE ai_monitor_cases SET log_channel_id = ?, log_message_id = ?, updated_at = ? WHERE case_id = ?", [channelId, messageId, Date.now(), caseId]);
    }

    private async markCase(caseId: string, status: "solved" | "actioned", resolverId?: string | null) {
        await db.query("UPDATE ai_monitor_cases SET status = ?, updated_at = ?, reason = IF(reason IS NULL, '', reason) WHERE case_id = ?", [status, Date.now(), caseId]);
        if (resolverId) {
            await db.query("INSERT INTO staff_audit_log SET ?", [{
                staff_id: resolverId,
                action_type: status === "solved" ? "ai_monitor_solved" : "ai_monitor_actioned",
                target_id: caseId,
                details: `Case ${caseId} ${status}`,
                created_at: Date.now()
            }]);
        }
    }

    private async sendLog(config: MonitorConfig, guild: Guild, payload: {
        caseId: string;
        eventType: string;
        summary: string;
        reason: string;
        risk: string;
        recommended_action: string;
        userId?: string | null;
        channelId?: string | null;
        messageId?: string | null;
        autoAction?: string | null;
        confidence?: number | null;
    }) {
        const channel = guild.channels.cache.get(config.logs_channel) as TextChannel | undefined;
        if (!channel || channel.type !== ChannelType.GuildText) return;
        const color = payload.risk === "high" ? 0xe74c3c : payload.risk === "medium" ? 0xf39c12 : 0x3498db;
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle("AI Monitor Alert")
            .addFields(
                { name: "Case", value: payload.caseId, inline: true },
                { name: "Event", value: payload.eventType, inline: true },
                { name: "Risk", value: payload.risk, inline: true },
                { name: "Summary", value: payload.summary || "N/A", inline: false },
                { name: "Reason", value: payload.reason || "N/A", inline: false },
                { name: "Recommended", value: payload.recommended_action, inline: true }
            )
            .setTimestamp();

        if (payload.userId) embed.addFields({ name: "User", value: `<@${payload.userId}>`, inline: true });
        if (payload.channelId) embed.addFields({ name: "Channel", value: `<#${payload.channelId}>`, inline: true });
        if (payload.messageId && payload.channelId) {
            const link = `https://discord.com/channels/${guild.id}/${payload.channelId}/${payload.messageId}`;
            embed.addFields({ name: "Message", value: link, inline: false });
        }
        if (payload.autoAction) embed.addFields({ name: "Auto Action", value: payload.autoAction, inline: false });
        if (payload.confidence !== null && payload.confidence !== undefined) embed.addFields({ name: "Confidence", value: payload.confidence.toFixed(2), inline: true });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`aimon_action-${payload.caseId}`).setLabel("Automatically take action").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`aimon_solve-${payload.caseId}`).setLabel("Mark as solved").setStyle(ButtonStyle.Secondary)
        );

        const sent = await channel.send({
            embeds: [embed],
            components: [row]
        });

        await this.updateCaseLog(payload.caseId, sent.channelId, sent.id);
    }

    private async executeAction(guild: Guild, action: string, context: {
        userId?: string | null;
        channelId?: string | null;
        messageId?: string | null;
        reason?: string | null;
        durationMs?: number | null;
    }): Promise<{ ok: boolean; detail: string }>{
        const reason = context.reason || "AI Monitor";
        try {
            if (action === "delete_message" && context.channelId && context.messageId) {
                const channel = guild.channels.cache.get(context.channelId) as TextChannel | undefined;
                if (!channel) return { ok: false, detail: "Channel not found" };
                const msg = await channel.messages.fetch(context.messageId).catch(() => null);
                if (!msg) return { ok: false, detail: "Message not found" };
                await msg.delete();
                return { ok: true, detail: "Message deleted" };
            }
            if (!context.userId) return { ok: false, detail: "User not found" };
            const member = await guild.members.fetch(context.userId).catch(() => null);
            if (!member) return { ok: false, detail: "Member not found" };
            if (action === "warn") {
                await member.send(`You received a warning: ${reason}`).catch(() => null);
                return { ok: true, detail: "Warned via DM" };
            }
            if (action === "timeout") {
                const duration = context.durationMs && context.durationMs > 0 ? context.durationMs : 10 * 60 * 1000;
                await member.timeout(duration, reason);
                return { ok: true, detail: `Timed out for ${Math.round(duration / 60000)}m` };
            }
            if (action === "kick") {
                await member.kick(reason);
                return { ok: true, detail: "Kicked" };
            }
            if (action === "ban") {
                await guild.members.ban(context.userId, { reason });
                return { ok: true, detail: "Banned" };
            }
            return { ok: false, detail: "Unknown action" };
        } catch (error: any) {
            return { ok: false, detail: error?.message || String(error) };
        }
    }

    private buildEventData(params: {
        eventType: string;
        message?: Message | null;
        member?: GuildMember | PartialGuildMember | null;
        guild?: Guild | null;
        channelId?: string | null;
        invite?: Invite | null;
        extra?: any;
    }) {
        const data: any = { eventType: params.eventType };
        if (params.guild) data.guild = { id: params.guild.id, name: params.guild.name };
        if (params.message) {
            data.message = {
                id: params.message.id,
                content: params.message.content,
                authorId: params.message.author?.id,
                authorTag: params.message.author?.tag,
                channelId: params.message.channelId,
                attachments: params.message.attachments.map(a => ({ url: a.url, name: a.name }))
            };
        }
        if (params.member) {
            data.member = {
                id: params.member.id,
                tag: params.member.user?.tag ?? null,
                joinedAt: params.member.joinedAt?.toISOString() ?? null,
                roles: params.member.roles?.cache ? params.member.roles.cache.map(r => r.name) : []
            };
        }
        if (params.channelId) data.channelId = params.channelId;
        if (params.invite) {
            data.invite = {
                code: params.invite.code,
                inviterId: params.invite.inviter?.id ?? null,
                uses: params.invite.uses ?? 0,
                maxUses: params.invite.maxUses ?? 0,
                channelId: params.invite.channelId
            };
        }
        if (params.extra) data.extra = params.extra;
        return data;
    }

    private async handleEvent(eventType: string, guild: Guild, data: any, context: {
        userId?: string | null;
        channelId?: string | null;
        messageId?: string | null;
    }, configOverride?: MonitorConfig | null) {
        const config = configOverride ?? await this.getConfig(guild.id);
        if (!config || !config.enabled) return;
        if (!this.canProcess(guild.id)) return;
        if (!config.logs_channel || config.logs_channel === "0") return;

        const history = await this.getRecentHistory(guild.id, context.userId ?? null);
        if (history.length > 0) data.recent_cases = history;

        const triage = await this.triage(eventType, data);
        const scamSignal = Boolean(data?.extra?.scam_signal);
        if (!triage.suspicious && !scamSignal) return;

        const review = await this.review(eventType, data);
        if (!review.suspicious) return;

        if (eventType === "message_create" && context.messageId) {
            this.markAlertedMessage(context.messageId);
        }

        const actionPayload = {
            userId: context.userId ?? null,
            channelId: context.channelId ?? null,
            messageId: context.messageId ?? null,
            reason: review.reason || triage.reason,
            durationMs: review.action_duration_ms ?? null,
            deleteMessage: Boolean(review.delete_message)
        };

        let autoAction: string | null = null;
        let autoActionTaken = false;

        if (config.allow_actions && review.recommended_action && review.recommended_action !== "notify") {
            const actionResult = await this.executeAction(guild, review.recommended_action, {
                userId: actionPayload.userId,
                channelId: actionPayload.channelId,
                messageId: actionPayload.messageId,
                reason: actionPayload.reason,
                durationMs: actionPayload.durationMs
            });
            autoAction = `${review.recommended_action}: ${actionResult.ok ? "ok" : "failed"} (${actionResult.detail})`;
            autoActionTaken = actionResult.ok;
        } else if (config.allow_actions && review.recommended_action === "delete_message" && actionPayload.messageId) {
            const actionResult = await this.executeAction(guild, "delete_message", {
                channelId: actionPayload.channelId,
                messageId: actionPayload.messageId,
                reason: actionPayload.reason
            });
            autoAction = `delete_message: ${actionResult.ok ? "ok" : "failed"} (${actionResult.detail})`;
            autoActionTaken = actionResult.ok;
        }

        const caseId = await this.createCase({
            guildId: guild.id,
            eventType,
            userId: context.userId,
            channelId: context.channelId,
            messageId: context.messageId,
            summary: review.summary || triage.summary,
            risk: review.risk || triage.risk,
            recommended_action: review.recommended_action || "notify",
            action_payload: actionPayload,
            allow_actions: config.allow_actions,
            auto_action_taken: autoActionTaken,
            reason: review.reason || triage.reason,
            confidence: review.confidence ?? triage.confidence
        });

        await this.sendLog(config, guild, {
            caseId,
            eventType,
            summary: review.summary || triage.summary,
            reason: review.reason || triage.reason,
            risk: review.risk || triage.risk,
            recommended_action: review.recommended_action || "notify",
            userId: context.userId,
            channelId: context.channelId,
            messageId: context.messageId,
            autoAction,
            confidence: review.confidence ?? triage.confidence
        });
    }

    public async handleMessageCreate(message: Message) {
        if (!message.guild || message.author.bot) return;
        if (!message.content && message.attachments.size === 0) return;
        const config = await this.getConfig(message.guild.id);
        if (!config || !config.enabled) return;
        const content = message.content || "";
        const scamPatterns = [
            /accidentally sent you\s*\$?\d+/i,
            /send (?:me|it) back/i,
            /mark (?:it|this) as delivered/i,
            /payment (?:is|was) (?:pending|failed)/i,
            /refund (?:me|it)/i,
            /chargeback/i,
            /gift ?card/i,
            /crypto|bitcoin|usdt|eth/i,
            /verification (?:fee|payment)/i,
            /wire transfer|bank transfer/i,
            /i sent you \$?\d+/i,
            /prove (?:you|it) by/i
        ];
        const scamSignal = scamPatterns.some(pattern => pattern.test(content));
        const urlMatches = content.match(/https?:\/\/[^\s]+/gi) || [];
        const inviteMatches = content.match(/discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+/gi) || [];
        const mentionCount = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0);
        if (!config.analyze_potentially) {
            const hasAttachment = message.attachments.size > 0;
            const hasLink = urlMatches.length > 0 || inviteMatches.length > 0;
            const hasMentions = mentionCount >= 5;
            if (!hasAttachment && !hasLink && !hasMentions && !scamSignal) return;
        }
        const data = this.buildEventData({
            eventType: "message_create",
            message,
            guild: message.guild,
            extra: {
                urls: urlMatches,
                invites: inviteMatches,
                mentionCount,
                attachments: message.attachments.map(a => ({ url: a.url, name: a.name, contentType: a.contentType, size: a.size })),
                scam_signal: scamSignal
            }
        });
        await this.handleEvent("message_create", message.guild, data, {
            userId: message.author.id,
            channelId: message.channelId,
            messageId: message.id
        }, config);
    }

    public async handleMessageUpdate(oldMessage: Message | any, newMessage: Message | any) {
        const message = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
        if (!message || !message.guild || message.author?.bot) return;
        if (!message.content && message.attachments.size === 0) return;
        const data = this.buildEventData({ eventType: "message_update", message, guild: message.guild });
        await this.handleEvent("message_update", message.guild, data, {
            userId: message.author.id,
            channelId: message.channelId,
            messageId: message.id
        });
    }

    public async handleMessageDelete(message: Message | any) {
        if (!message?.guild) return;
        if (message?.id && this.isRecentlyAlertedMessage(message.id)) return;
        const data = this.buildEventData({
            eventType: "message_delete",
            message: message.partial ? null : message,
            guild: message.guild,
            channelId: message.channelId,
            extra: { content: message.content ?? null }
        });
        await this.handleEvent("message_delete", message.guild, data, {
            userId: message.author?.id ?? null,
            channelId: message.channelId,
            messageId: message.id
        });
    }

    public async handleMemberAdd(member: GuildMember) {
        if (!member.guild) return;
        const config = await this.getConfig(member.guild.id);
        if (!config || !config.enabled) return;
        const data = this.buildEventData({ eventType: "member_add", member, guild: member.guild });
        await this.handleEvent("member_add", member.guild, data, {
            userId: member.id,
            channelId: null,
            messageId: null
        }, config);
        if (!config.analyze_potentially) return;
        const now = Date.now();
        const windowMs = 60000;
        const burst = this.joinBurst.get(member.guild.id);
        if (!burst || now - burst.windowStart > windowMs) {
            this.joinBurst.set(member.guild.id, { windowStart: now, count: 1 });
            return;
        }
        burst.count += 1;
        if (burst.count < 5) return;
        const burstData = this.buildEventData({
            eventType: "member_join_burst",
            member,
            guild: member.guild,
            extra: { count: burst.count, window_ms: windowMs }
        });
        await this.handleEvent("member_join_burst", member.guild, burstData, {
            userId: member.id,
            channelId: null,
            messageId: null
        }, config);
    }

    public async handleMemberRemove(member: GuildMember | PartialGuildMember) {
        if (!member.guild) return;
        const data = this.buildEventData({ eventType: "member_remove", member, guild: member.guild });
        await this.handleEvent("member_remove", member.guild, data, {
            userId: member.id,
            channelId: null,
            messageId: null
        });
    }

    public async handleChannelCreate(guild: Guild, channelId: string) {
        const data = this.buildEventData({ eventType: "channel_create", guild, channelId });
        await this.handleEvent("channel_create", guild, data, {
            userId: null,
            channelId,
            messageId: null
        });
    }

    public async handleChannelDelete(guild: Guild, channelId: string) {
        const data = this.buildEventData({ eventType: "channel_delete", guild, channelId });
        await this.handleEvent("channel_delete", guild, data, {
            userId: null,
            channelId,
            messageId: null
        });
    }

    public async handleChannelUpdate(guild: Guild, channelId: string) {
        const data = this.buildEventData({ eventType: "channel_update", guild, channelId });
        await this.handleEvent("channel_update", guild, data, {
            userId: null,
            channelId,
            messageId: null
        });
    }

    public async handleInviteCreate(invite: Invite) {
        if (!invite.guild?.id) return;
        const guild = this.client.guilds.cache.get(invite.guild.id);
        if (!guild) return;
        const data = this.buildEventData({ eventType: "invite_create", guild, invite });
        await this.handleEvent("invite_create", guild, data, {
            userId: invite.inviter?.id ?? null,
            channelId: invite.channelId ?? null,
            messageId: null
        });
    }

    public async handleButton(interaction: any): Promise<boolean> {
        const [event, caseId] = interaction.customId.split("-");
        if (!caseId) return false;
        if (event !== "aimon_action" && event !== "aimon_solve") return false;
        const rows = await db.query("SELECT * FROM ai_monitor_cases WHERE case_id = ?", [caseId]) as unknown as any[];
        if (!rows || !rows[0]) {
            await interaction.reply({ content: "Case not found.", ephemeral: true });
            return true;
        }
        const record = rows[0];
        if (!interaction.inGuild() || interaction.guildId !== record.guild_id) {
            await interaction.reply({ content: "Invalid guild.", ephemeral: true });
            return true;
        }
        if (event === "aimon_solve") {
            await this.markCase(caseId, "solved", interaction.user.id);
            await this.disableButtons(interaction);
            await interaction.reply({ content: "Marked as solved.", ephemeral: true });
            return true;
        }
        const guild = this.client.guilds.cache.get(record.guild_id);
        if (!guild) {
            await interaction.reply({ content: "Guild not found.", ephemeral: true });
            return true;
        }
        const payload = record.action_payload ? JSON.parse(record.action_payload) : {};
        const action = record.recommended_action || "notify";
        if (action === "notify") {
            await interaction.reply({ content: "No action recommended for this case.", ephemeral: true });
            return true;
        }
        const result = await this.executeAction(guild, action, {
            userId: payload.userId ?? record.user_id,
            channelId: payload.channelId ?? record.channel_id,
            messageId: payload.messageId ?? record.message_id,
            reason: payload.reason ?? record.reason,
            durationMs: payload.durationMs ?? null
        });
        await this.markCase(caseId, "actioned", interaction.user.id);
        await this.disableButtons(interaction);
        await interaction.reply({ content: result.ok ? "Action executed." : `Action failed: ${result.detail}`, ephemeral: true });
        return true;
    }

    private async disableButtons(interaction: any) {
        const message = interaction.message;
        if (!message) return;
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("aimon_action_disabled").setLabel("Automatically take action").setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setCustomId("aimon_solve_disabled").setLabel("Mark as solved").setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        await message.edit({ components: [disabledRow] });
    }

    private markAlertedMessage(messageId: string) {
        const ttlMs = 5 * 60 * 1000;
        this.recentAlertedMessages.set(messageId, Date.now() + ttlMs);
    }

    private isRecentlyAlertedMessage(messageId: string): boolean {
        const expiresAt = this.recentAlertedMessages.get(messageId);
        if (!expiresAt) return false;
        if (Date.now() > expiresAt) {
            this.recentAlertedMessages.delete(messageId);
            return false;
        }
        return true;
    }
}
