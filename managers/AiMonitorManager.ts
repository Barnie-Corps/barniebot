import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, Client, EmbedBuilder, Guild, GuildMember, Invite, Message, PartialGuildMember, PermissionFlagsBits, TextChannel } from "discord.js";
import db from "../mysql/database";
import NVIDIAModels from "../NVIDIAModels";
import Log from "../Log";
import utils from "../utils";
import { executeAiMonitorTool, getAiMonitorTools, type AIMonitorToolName } from "../AIMonitorFunctions";

type MonitorConfig = {
    guild_id: string;
    enabled: boolean;
    logs_channel: string;
    allow_actions: boolean;
    analyze_potentially: boolean;
    allow_investigation_tools: boolean;
    monitor_language: string;
};

type TriageResult = {
    suspicious: boolean;
    risk: "low" | "medium" | "high";
    summary: string;
    reason: string;
    confidence: number;
};

type ActionType = "notify" | "warn" | "timeout" | "kick" | "ban" | "delete_message";

type ReviewResult = {
    suspicious: boolean;
    risk: "low" | "medium" | "high";
    summary: string;
    reason: string;
    recommended_action?: ActionType;
    recommended_actions?: ActionType[];
    warning_message?: string;
    action_duration_ms?: number;
    delete_message?: boolean;
    confidence: number;
};

export default class AiMonitorManager {
    private rateLimits = new Map<string, { windowStart: number; count: number }>();
    private joinBurst = new Map<string, { windowStart: number; count: number }>();
    private recentAlertedMessages = new Map<string, number>();
    private logLabelCache = new Map<string, {
        title: string;
        fields: {
            caseLabel: string;
            eventLabel: string;
            riskLabel: string;
            summaryLabel: string;
            reasonLabel: string;
            recommendedLabel: string;
            userLabel: string;
            channelLabel: string;
            messageLabel: string;
            autoActionLabel: string;
            confidenceLabel: string;
        };
        buttons: {
            actionLabel: string;
            solveLabel: string;
        };
    }>();

    constructor(private client: Client) {}

    private async getConfig(guildId: string): Promise<MonitorConfig | null> {
        const rows = await db.query("SELECT * FROM ai_monitor_configs WHERE guild_id = ?", [guildId]) as unknown as any[];
        if (!rows || !rows[0]) return null;
        return {
            guild_id: rows[0].guild_id,
            enabled: Boolean(rows[0].enabled),
            logs_channel: rows[0].logs_channel,
            allow_actions: Boolean(rows[0].allow_actions),
            analyze_potentially: Boolean(rows[0].analyze_potentially),
            allow_investigation_tools: Boolean(rows[0].allow_investigation_tools),
            monitor_language: typeof rows[0].monitor_language === "string" && rows[0].monitor_language.trim()
                ? rows[0].monitor_language.trim().toLowerCase()
                : "en"
        };
    }

    private async getLogLabels(language: string) {
        const normalized = typeof language === "string" && language.trim() ? language.trim().toLowerCase() : "en";
        const cached = this.logLabelCache.get(normalized);
        if (cached) return cached;
        const base = {
            title: "AI Monitor Alert",
            fields: {
                caseLabel: "Case",
                eventLabel: "Event",
                riskLabel: "Risk",
                summaryLabel: "Summary",
                reasonLabel: "Reason",
                recommendedLabel: "Recommended",
                userLabel: "User",
                channelLabel: "Channel",
                messageLabel: "Message",
                autoActionLabel: "Auto Action",
                confidenceLabel: "Confidence"
            },
            buttons: {
                actionLabel: "Automatically take action",
                solveLabel: "Mark as solved"
            }
        };
        if (normalized === "en") return base;
        try {
            const translated = await utils.autoTranslate(base, "en", normalized);
            this.logLabelCache.set(normalized, translated);
            return translated;
        } catch {
            return base;
        }
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

    private getAccountAgeDays(user: { createdTimestamp?: number } | null): number | null {
        if (!user?.createdTimestamp) return null;
        const ageMs = Date.now() - user.createdTimestamp;
        return Math.floor(ageMs / (1000 * 60 * 60 * 24));
    }

    private buildMessageSignals(message: Message) {
        const content = message.content || "";
        const lowerContent = content.toLowerCase();
        const hasNonAscii = /[^\x00-\x7F]/.test(content);
        const scamPatterns = [
            /accidentally sent you\s*\$?\d+/i,
            /send (?:me|it) back/i,
            /mark (?:it|this) as delivered/i,
            /payment (?:is|was) (?:pending|failed)/i,
            /refund (?:me|it)/i,
            /chargeback/i,
            /gift ?card/i,
            /crypto|bitcoin|usdt|eth|ltc|bnb|sol/i,
            /verification (?:fee|payment)/i,
            /wire transfer|bank transfer/i,
            /i sent you \$?\d+/i,
            /prove (?:you|it) by/i,
            /free nitro|discord\.gift/i,
            /steam (?:code|gift)/i,
            /limited time|urgent|act now/i,
            /investment|double your money/i,
            /free (?:money|cash|crypto)/i,
            /easy money/i,
            /send (?:me|the) money/i,
            /giveaway|winner|you (?:won|have won)/i,
            /claim (?:your|the) (?:reward|prize|gift)/i,
            /verify (?:your|the) account/i,
            /login (?:to|here)|sign in/i,
            /account (?:locked|suspended|disabled)/i,
            /support team|customer support/i,
            /limited offer|last chance/i,
            /airdrop|whitelist/i,
            /bonus (?:available|ending)/i
        ];
        const credentialBaitPatterns = [
            /unusual activity|suspicious activity|security alert/i,
            /reset (?:your )?password/i,
            /confirm (?:your )?account/i,
            /verify (?:your )?(?:email|phone|account)/i,
            /2fa|otp|verification code/i,
            /scan (?:this )?qr|qr code/i
        ];
        const suspiciousKeywords = [
            "refund",
            "chargeback",
            "delivery",
            "mark it",
            "invoice",
            "payment",
            "billing",
            "wire",
            "bank",
            "cashapp",
            "venmo",
            "paypal",
            "airdrop",
            "claim",
            "verify",
            "free nitro",
            "gift card",
            "crypto",
            "btc",
            "usdt",
            "free money",
            "free cash",
            "easy money",
            "send me the money",
            "giveaway",
            "winner",
            "reward",
            "prize",
            "account locked",
            "account suspended",
            "login",
            "support",
            "bonus",
            "whitelist",
            "nitro",
            "steam",
            "epic",
            "robux",
            "vbucks",
            "gift",
            "wallet",
            "seed phrase",
            "private key",
            "token",
            "qr code"
        ];
        const localizedScamPatterns = [
            /verifica(?:r|\s*tu)\s+cuenta/i,
            /inicia\s+sesion|iniciar\s+sesion/i,
            /has\s+ganado|ganador|premio/i,
            /tarjeta\s+regalo|regalo\s+gratis/i,
            /dinero\s+gratis|dinero\s+facil/i,
            /verifique\s+sua\s+conta|conta\s+suspensa/i,
            /faca\s+login|entrar\s+na\s+conta/i,
            /voce\s+ganhou|premio|brinde/i,
            /cartao\s+presente|presente\s+gratis/i,
            /argent\s+gratuit|cadeau|carte\s+cadeau/i,
            /verifiez\s+votre\s+compte|compte\s+suspendu/i,
            /connexion|se\s+connecter/i,
            /konto\s+gesperrt|konto\s+bestatigen/i,
            /melden\s+sie\s+sich\s+an|anmelden/i,
            /gratis\s+geld|geschenk/i,
            /verifica\s+il\s+tuo\s+account|account\s+sospeso/i,
            /accedi|accesso/i,
            /denaro\s+gratis|carta\s+regalo/i,
            /verifikasi\s+akun|akun\s+ditangguhkan/i,
            /masuk\s+untuk\s+melanjutkan|hadiah|uang\s+gratis/i,
            /i-?verify\s+ang\s+account|na-?suspend\s+ang\s+account/i,
            /mag-?login|premyo|libreng\s+pera/i
        ];
        const localizedKeywords = [
            "verifica tu cuenta",
            "inicia sesion",
            "has ganado",
            "tarjeta regalo",
            "dinero gratis",
            "verifique sua conta",
            "conta suspensa",
            "voce ganhou",
            "cartao presente",
            "argent gratuit",
            "carte cadeau",
            "verifiez votre compte",
            "compte suspendu",
            "connexion",
            "konto gesperrt",
            "konto bestaetigen",
            "anmelden",
            "geschenk",
            "verifica il tuo account",
            "account sospeso",
            "denaro gratis",
            "carta regalo",
            "verifikasi akun",
            "akun ditangguhkan",
            "uang gratis",
            "i-verify ang account",
            "na-suspend ang account",
            "premyo",
            "libreng pera"
        ];
        const badExtensions = [
            "exe",
            "scr",
            "bat",
            "cmd",
            "js",
            "jar",
            "vbs",
            "ps1",
            "apk",
            "msi",
            "dll",
            "com",
            "lnk",
            "hta",
            "appx",
            "appxbundle",
            "cab",
            "zip",
            "rar",
            "7z",
            "iso",
            "img"
        ];
        const obfuscatedLink = /hxxp|\[\.\]|\(dot\)|\{dot\}|\s+dot\s+|\s+slash\s+/i.test(content);
        const httpMatches = content.match(/https?:\/\/[^\s)]+/gi) || [];
        const wwwMatches = content.match(/\bwww\.[^\s)]+/gi) || [];
        const urlMatches = Array.from(new Set([
            ...httpMatches,
            ...wwwMatches.map(match => `https://${match}`)
        ]));
        const inviteMatches = content.match(/discord\.gg\/[^\s]+|discord\.com\/invite\/[^\s]+/gi) || [];
        const markdownLinks = Array.from(content.matchAll(/\[([^\]]{1,80})\]\((https?:\/\/[^)\s]+)\)/gi)).map(match => ({
            text: match[1] || "",
            url: match[2]
        }));
        const shortLink = urlMatches.some(u => /(bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|cutt\.ly|rb\.gy|rebrand\.ly|shorturl\.at|linktr\.ee|ow\.ly|buff\.ly|qrco\.de)/i.test(u));
        const mentionCount = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0);
        const scamSignal = scamPatterns.some(pattern => pattern.test(content));
        const localizedPatternSignal = localizedScamPatterns.some(pattern => pattern.test(content));
        const credentialBaitSignal = credentialBaitPatterns.some(pattern => pattern.test(content));
        const keywordSignal = suspiciousKeywords.some(word => lowerContent.includes(word));
        const localizedKeywordSignal = localizedKeywords.some(word => lowerContent.includes(word));
        const attachmentSignal = message.attachments.some(att => {
            const name = (att.name || "").toLowerCase();
            const ext = name.includes(".") ? name.split(".").pop() : "";
            return ext ? badExtensions.includes(ext) : false;
        });
        const suspiciousAttachmentName = message.attachments.some(att => {
            const name = (att.name || "").toLowerCase();
            const doubleExt = /\.(pdf|docx|xlsx|pptx|png|jpg|jpeg|gif|mp4|txt)\.(exe|scr|bat|cmd|js|vbs|ps1|com|lnk)$/i.test(name);
            const hasRlo = /\u202e/i.test(name);
            return doubleExt || hasRlo;
        });
        const urlDomains = urlMatches.map(url => {
            try {
                return new URL(url).hostname.toLowerCase();
            } catch {
                return null;
            }
        }).filter((value): value is string => Boolean(value));
        const markdownDomains = markdownLinks.map(link => {
            try {
                return new URL(link.url).hostname.toLowerCase();
            } catch {
                return null;
            }
        }).filter((value): value is string => Boolean(value));
        const allDomains = Array.from(new Set([...urlDomains, ...markdownDomains]));
        const riskyTlds = [".ru", ".tk", ".ml", ".ga", ".cf", ".gq", ".top", ".xyz", ".click", ".icu", ".shop"];
        const suspiciousDomainTokens = ["nitro", "gift", "airdrop", "giveaway", "reward", "bonus", "claim", "verify", "login", "support", "wallet", "steam", "epic", "roblox"];
        const brandAllowList = [
            { label: "discord", domains: ["discord.com", "discord.gg", "discordapp.com"] },
            { label: "steam", domains: ["steamcommunity.com", "steampowered.com", "steamstat.us"] },
            { label: "epic", domains: ["epicgames.com"] },
            { label: "roblox", domains: ["roblox.com"] },
            { label: "minecraft", domains: ["minecraft.net"] },
            { label: "riot", domains: ["riotgames.com", "leagueoflegends.com", "playvalorant.com"] },
            { label: "paypal", domains: ["paypal.com"] },
            { label: "microsoft", domains: ["microsoft.com", "live.com", "outlook.com"] },
            { label: "google", domains: ["google.com", "accounts.google.com"] }
        ];
        const isAllowedDomain = (domain: string, allowed: string[]) => {
            return allowed.some(allow => domain === allow || domain.endsWith(`.${allow}`));
        };
        const brandMismatch = markdownLinks.some(link => {
            const text = link.text.toLowerCase();
            let domain = "";
            try {
                domain = new URL(link.url).hostname.toLowerCase();
            } catch {
                return false;
            }
            return brandAllowList.some(brand => text.includes(brand.label) && !isAllowedDomain(domain, brand.domains));
        });
        const lookalikeDomainSignal = allDomains.some(domain => {
            return brandAllowList.some(brand => domain.includes(brand.label) && !isAllowedDomain(domain, brand.domains));
        });
        const suspiciousDomainSignal = allDomains.some(domain => {
            const hasRiskyTld = riskyTlds.some(tld => domain.endsWith(tld));
            const hasToken = suspiciousDomainTokens.some(token => domain.includes(token));
            return (hasRiskyTld && hasToken) || domain.includes("discord.gift");
        });
        const massMention = mentionCount >= 10 || (message.mentions.everyone && mentionCount >= 1);
        const multiInvite = inviteMatches.length >= 2;
        const linkAndMention = (urlMatches.length > 0 || inviteMatches.length > 0) && message.mentions.everyone;
        const promoLink = urlMatches.length > 0 && /(free|money|cash|claim|gift|giveaway|nitro|airdrop|login|verify|account|reward|prize|bonus)/i.test(content);
        const forceReview = scamSignal || localizedPatternSignal || keywordSignal || localizedKeywordSignal || credentialBaitSignal || obfuscatedLink || attachmentSignal || suspiciousAttachmentName || massMention || multiInvite || linkAndMention || promoLink || shortLink || brandMismatch || lookalikeDomainSignal || suspiciousDomainSignal || hasNonAscii;
        return {
            content,
            urlMatches,
            inviteMatches,
            mentionCount,
            scamSignal,
            localizedPatternSignal,
            keywordSignal,
            localizedKeywordSignal,
            credentialBaitSignal,
            obfuscatedLink,
            attachmentSignal,
            suspiciousAttachmentName,
            forceReview,
            promoLink,
            shortLink,
            brandMismatch,
            lookalikeDomainSignal,
            suspiciousDomainSignal,
            hasNonAscii,
            urlDomains: allDomains
        };
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

    private async triage(eventType: string, data: any, language: string): Promise<TriageResult> {
        const normalizedLanguage = typeof language === "string" && language.trim() ? language.trim().toLowerCase() : "en";
        const prompt = JSON.stringify({
            role: "triage",
            instructions: `Return JSON only with keys: suspicious(boolean), risk(\"low\"|\"medium\"|\"high\"), summary(string), reason(string), confidence(number 0-1). Use language: ${normalizedLanguage} for summary and reason.`,
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

    private async review(eventType: string, data: any, language: string): Promise<ReviewResult> {
        const normalizedLanguage = typeof language === "string" && language.trim() ? language.trim().toLowerCase() : "en";
        const prompt = JSON.stringify({
            role: "review",
            instructions: `Return JSON only with keys: suspicious(boolean), risk(\"low\"|\"medium\"|\"high\"), summary(string), reason(string), recommended_actions(array of up to 2 from [\"notify\",\"warn\",\"timeout\",\"kick\",\"ban\",\"delete_message\"]), warning_message(optional string for warn action), action_duration_ms(optional number), delete_message(optional boolean), confidence(number 0-1). Use recent_cases only as context; do not recommend punitive actions if the current content appears benign. If current content is benign, set suspicious=false, risk=low, recommended_actions=[\"notify\"]. Use language: ${normalizedLanguage} for summary, reason, and warning_message.`,
            eventType,
            data
        });
        const response = await NVIDIAModels.GetModelChatResponse([{ role: "user", content: prompt }], 12000, "monitor_large", false);
        return this.parseJson<ReviewResult>(response.content, {
            suspicious: false,
            risk: "low",
            summary: "not suspicious",
            reason: "",
            recommended_actions: ["notify"],
            confidence: 0
        });
    }

    private getInvestigationTools() {
        return getAiMonitorTools();
    }

    private async reviewWithTools(eventType: string, data: any, config: MonitorConfig, language: string): Promise<ReviewResult> {
        if (!config.allow_investigation_tools) return this.review(eventType, data, language);
        const tools = this.getInvestigationTools();
        if (!tools.length) return this.review(eventType, data, language);
        const normalizedLanguage = typeof language === "string" && language.trim() ? language.trim().toLowerCase() : "en";
        const prompt = JSON.stringify({
            role: "review",
            instructions: `Return JSON only with keys: suspicious(boolean), risk(\"low\"|\"medium\"|\"high\"), summary(string), reason(string), recommended_actions(array of up to 2 from [\"notify\",\"warn\",\"timeout\",\"kick\",\"ban\",\"delete_message\"]), warning_message(optional string for warn action), action_duration_ms(optional number), delete_message(optional boolean), confidence(number 0-1). Use tools only when needed. Use recent_cases only as context; do not recommend punitive actions if the current content appears benign. If current content is benign, set suspicious=false, risk=low, recommended_actions=[\"notify\"]. Use language: ${normalizedLanguage} for summary, reason, and warning_message.`,
            eventType,
            data
        });
        const chat = NVIDIAModels.CreateChatSession({
            tools: tools as any,
            model: "deepseek-ai/deepseek-v3.1-terminus",
            maxTokens: 1024,
            temperature: 0.4,
            topP: 0.8,
            systemInstruction: "You are an AI monitor investigator. You may call tools to verify suspicious activity. Only call tools provided. Never fabricate tool outputs. Return JSON only."
        });
        let result = await chat.sendMessage(prompt);
        for (let i = 0; i < 3; i += 1) {
            const calls = result.response.functionCalls() || [];
            if (!calls.length) {
                const text = result.response.text();
                return this.parseJson<ReviewResult>(text, {
                    suspicious: false,
                    risk: "low",
                    summary: "not suspicious",
                    reason: "",
                    recommended_actions: ["notify"],
                    confidence: 0
                });
            }
            const toolPayload = [] as Array<{ functionResponse: { name: string; response: { result: any } } }>;
            for (const call of calls) {
                console.log("[AI Monitor] tool call", {
                    tool: call.name,
                    eventType,
                    guildId: data?.guild?.id ?? null
                });
                const toolResult = await executeAiMonitorTool(call.name as AIMonitorToolName, call.args, {
                    guildId: data?.guild?.id ?? null,
                    requesterId: "__ai_monitor__"
                });
                toolPayload.push({
                    functionResponse: {
                        name: call.name,
                        response: { result: toolResult }
                    }
                });
            }
            result = await chat.sendMessage(toolPayload);
        }
        const finalText = result.response.text();
        return this.parseJson<ReviewResult>(finalText, {
            suspicious: false,
            risk: "low",
            summary: "not suspicious",
            reason: "",
            recommended_actions: ["notify"],
            confidence: 0
        });
    }

    private normalizeRecommendedActions(review: ReviewResult): ActionType[] {
        const allowList: ActionType[] = ["notify", "warn", "timeout", "kick", "ban", "delete_message"];
        const list = Array.isArray(review.recommended_actions) ? review.recommended_actions : (review.recommended_action ? [review.recommended_action] : []);
        const filtered = list.filter(action => allowList.includes(action)).slice(0, 2);
        return filtered.length > 0 ? filtered : ["notify"];
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
        recommended_actions?: string[] | null;
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
            recommended_actions: params.recommended_actions ? JSON.stringify(params.recommended_actions) : null,
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
        recommended_actions: string[];
        userId?: string | null;
        channelId?: string | null;
        messageId?: string | null;
        autoAction?: string | null;
        confidence?: number | null;
        language?: string | null;
    }) {
        const channel = guild.channels.cache.get(config.logs_channel) as TextChannel | undefined;
        if (!channel || channel.type !== ChannelType.GuildText) return;
        const labels = await this.getLogLabels(payload.language ?? config.monitor_language ?? "en");
        const color = payload.risk === "high" ? 0xe74c3c : payload.risk === "medium" ? 0xf39c12 : 0x3498db;
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(labels.title)
            .addFields(
                { name: labels.fields.caseLabel, value: payload.caseId, inline: true },
                { name: labels.fields.eventLabel, value: payload.eventType, inline: true },
                { name: labels.fields.riskLabel, value: payload.risk, inline: true },
                { name: labels.fields.summaryLabel, value: payload.summary || "N/A", inline: false },
                { name: labels.fields.reasonLabel, value: payload.reason || "N/A", inline: false },
                { name: labels.fields.recommendedLabel, value: payload.recommended_actions.join(" + "), inline: true }
            )
            .setTimestamp();

        if (payload.userId) embed.addFields({ name: labels.fields.userLabel, value: `<@${payload.userId}>`, inline: true });
        if (payload.channelId) embed.addFields({ name: labels.fields.channelLabel, value: `<#${payload.channelId}>`, inline: true });
        if (payload.messageId && payload.channelId) {
            const link = `https://discord.com/channels/${guild.id}/${payload.channelId}/${payload.messageId}`;
            embed.addFields({ name: labels.fields.messageLabel, value: link, inline: false });
        }
        if (payload.autoAction) embed.addFields({ name: labels.fields.autoActionLabel, value: payload.autoAction, inline: false });
        if (payload.confidence !== null && payload.confidence !== undefined) embed.addFields({ name: labels.fields.confidenceLabel, value: payload.confidence.toFixed(2), inline: true });

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`aimon_action-${payload.caseId}`).setLabel(labels.buttons.actionLabel).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`aimon_solve-${payload.caseId}`).setLabel(labels.buttons.solveLabel).setStyle(ButtonStyle.Secondary)
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
        warnMessage?: string | null;
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
                const warnText = context.warnMessage && context.warnMessage.trim().length > 0
                    ? context.warnMessage.trim()
                    : `You received a warning: ${reason}`;
                await member.send(warnText).catch(() => null);
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

        console.log("[AI Monitor] analyze", {
            eventType,
            guildId: guild.id,
            userId: context.userId ?? null,
            channelId: context.channelId ?? null,
            messageId: context.messageId ?? null
        });

        const monitorLanguage = typeof config.monitor_language === "string" && config.monitor_language.trim()
            ? config.monitor_language.trim().toLowerCase()
            : "en";
        const triage = await this.triage(eventType, data, monitorLanguage);
        const scamSignal = Boolean(data?.extra?.scam_signal);
        const forceReview = Boolean(data?.extra?.force_review);
        if (!triage.suspicious && !scamSignal && !forceReview) return;

        const history = await this.getRecentHistory(guild.id, context.userId ?? null);
        if (history.length > 0) data.recent_cases = history;

        console.log("[AI Monitor] large review", {
            eventType,
            guildId: guild.id,
            allowInvestigationTools: config.allow_investigation_tools
        });
        const review = await this.reviewWithTools(eventType, data, config, monitorLanguage);
        if (!review.suspicious) return;
        const recommendedActions = this.normalizeRecommendedActions(review);

        if (eventType === "message_create" && context.messageId) {
            this.markAlertedMessage(context.messageId);
        }

        const actionPayload = {
            userId: context.userId ?? null,
            channelId: context.channelId ?? null,
            messageId: context.messageId ?? null,
            reason: review.reason || triage.reason,
            warnMessage: review.warning_message ?? null,
            durationMs: review.action_duration_ms ?? null,
            deleteMessage: Boolean(review.delete_message),
            recommended_actions: recommendedActions
        };

        let autoAction: string | null = null;
        let autoActionTaken = false;

        if (config.allow_actions) {
            const results: string[] = [];
            for (const action of recommendedActions) {
                if (action === "notify") continue;
                const actionResult = await this.executeAction(guild, action, {
                    userId: actionPayload.userId,
                    channelId: actionPayload.channelId,
                    messageId: actionPayload.messageId,
                    reason: actionPayload.reason,
                    warnMessage: actionPayload.warnMessage,
                    durationMs: actionPayload.durationMs
                });
                results.push(`${action}: ${actionResult.ok ? "ok" : "failed"} (${actionResult.detail})`);
                if (actionResult.ok) autoActionTaken = true;
            }
            autoAction = results.length > 0 ? results.join("; ") : null;
        }

        const caseId = await this.createCase({
            guildId: guild.id,
            eventType,
            userId: context.userId,
            channelId: context.channelId,
            messageId: context.messageId,
            summary: review.summary || triage.summary,
            risk: review.risk || triage.risk,
            recommended_action: recommendedActions[0] || "notify",
            recommended_actions: recommendedActions,
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
            recommended_actions: recommendedActions,
            userId: context.userId,
            channelId: context.channelId,
            messageId: context.messageId,
            autoAction,
            confidence: review.confidence ?? triage.confidence,
            language: monitorLanguage
        });
    }

    public async handleMessageCreate(message: Message) {
        if (!message.guild || message.author.bot) return;
        if (!message.content && message.attachments.size === 0) return;
        const config = await this.getConfig(message.guild.id);
        if (!config || !config.enabled) return;
        const signals = this.buildMessageSignals(message);
        const accountAgeDays = this.getAccountAgeDays(message.author);
        const lowAgeSignal = accountAgeDays !== null && accountAgeDays < 3 && (signals.scamSignal || signals.keywordSignal || signals.obfuscatedLink);
        if (!config.analyze_potentially) {
            const hasAttachment = message.attachments.size > 0;
            const hasLink = signals.urlMatches.length > 0 || signals.inviteMatches.length > 0;
            const hasMentions = signals.mentionCount >= 5;
            if (!hasAttachment && !hasLink && !hasMentions && !signals.scamSignal && !signals.forceReview) return;
        }
        const data = this.buildEventData({
            eventType: "message_create",
            message,
            guild: message.guild,
            extra: {
                urls: signals.urlMatches,
                invites: signals.inviteMatches,
                mentionCount: signals.mentionCount,
                attachments: message.attachments.map(a => ({ url: a.url, name: a.name, contentType: a.contentType, size: a.size })),
                scam_signal: signals.scamSignal,
                localized_pattern_signal: signals.localizedPatternSignal,
                keyword_signal: signals.keywordSignal,
                localized_keyword_signal: signals.localizedKeywordSignal,
                credential_bait_signal: signals.credentialBaitSignal,
                obfuscated_link: signals.obfuscatedLink,
                attachment_signal: signals.attachmentSignal,
                suspicious_attachment_name: signals.suspiciousAttachmentName,
                promo_link: signals.promoLink,
                short_link: signals.shortLink,
                brand_mismatch: signals.brandMismatch,
                lookalike_domain: signals.lookalikeDomainSignal,
                suspicious_domain: signals.suspiciousDomainSignal,
                non_ascii: signals.hasNonAscii,
                url_domains: signals.urlDomains,
                account_age_days: accountAgeDays,
                force_review: signals.forceReview || lowAgeSignal
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
        const config = await this.getConfig(message.guild.id);
        if (!config || !config.enabled) return;
        const signals = this.buildMessageSignals(message);
        const accountAgeDays = this.getAccountAgeDays(message.author);
        const lowAgeSignal = accountAgeDays !== null && accountAgeDays < 3 && (signals.scamSignal || signals.keywordSignal || signals.obfuscatedLink);
        if (!config.analyze_potentially) {
            const hasAttachment = message.attachments.size > 0;
            const hasLink = signals.urlMatches.length > 0 || signals.inviteMatches.length > 0;
            const hasMentions = signals.mentionCount >= 5;
            if (!hasAttachment && !hasLink && !hasMentions && !signals.scamSignal && !signals.forceReview) return;
        }
        const data = this.buildEventData({
            eventType: "message_update",
            message,
            guild: message.guild,
            extra: {
                urls: signals.urlMatches,
                invites: signals.inviteMatches,
                mentionCount: signals.mentionCount,
                attachments: message.attachments.map((a: any) => ({ url: a.url, name: a.name, contentType: a.contentType, size: a.size })),
                scam_signal: signals.scamSignal,
                localized_pattern_signal: signals.localizedPatternSignal,
                keyword_signal: signals.keywordSignal,
                localized_keyword_signal: signals.localizedKeywordSignal,
                credential_bait_signal: signals.credentialBaitSignal,
                obfuscated_link: signals.obfuscatedLink,
                attachment_signal: signals.attachmentSignal,
                suspicious_attachment_name: signals.suspiciousAttachmentName,
                promo_link: signals.promoLink,
                short_link: signals.shortLink,
                brand_mismatch: signals.brandMismatch,
                lookalike_domain: signals.lookalikeDomainSignal,
                suspicious_domain: signals.suspiciousDomainSignal,
                non_ascii: signals.hasNonAscii,
                url_domains: signals.urlDomains,
                account_age_days: accountAgeDays,
                force_review: signals.forceReview || lowAgeSignal
            }
        });
        await this.handleEvent("message_update", message.guild, data, {
            userId: message.author.id,
            channelId: message.channelId,
            messageId: message.id
        }, config);
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
        const accountAgeDays = this.getAccountAgeDays(member.user);
        const data = this.buildEventData({
            eventType: "member_add",
            member,
            guild: member.guild,
            extra: {
                account_age_days: accountAgeDays,
                force_review: accountAgeDays !== null && accountAgeDays < 3
            }
        });
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

    public async handleMemberUpdate(oldMember: GuildMember, newMember: GuildMember) {
        if (!newMember.guild) return;
        const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
        const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
        const highPerms = [
            PermissionFlagsBits.Administrator,
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageWebhooks,
            PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.KickMembers
        ];
        const addedPrivRoles = addedRoles.filter(r => highPerms.some(p => r.permissions.has(p)));
        const removedPrivRoles = removedRoles.filter(r => highPerms.some(p => r.permissions.has(p)));
        if (addedRoles.size === 0 && removedRoles.size === 0) return;
        const data = this.buildEventData({
            eventType: "member_update",
            member: newMember,
            guild: newMember.guild,
            extra: {
                added_roles: addedRoles.map(r => ({ id: r.id, name: r.name })),
                removed_roles: removedRoles.map(r => ({ id: r.id, name: r.name })),
                added_priv_roles: addedPrivRoles.map(r => ({ id: r.id, name: r.name })),
                removed_priv_roles: removedPrivRoles.map(r => ({ id: r.id, name: r.name })),
                force_review: addedPrivRoles.size > 0 || removedPrivRoles.size > 0
            }
        });
        await this.handleEvent("member_update", newMember.guild, data, {
            userId: newMember.id,
            channelId: null,
            messageId: null
        });
    }

    public async handleRoleCreate(role: any) {
        if (!role?.guild) return;
        const highPerms = [
            PermissionFlagsBits.Administrator,
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageWebhooks,
            PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.KickMembers
        ];
        const hasHighPerm = highPerms.some(p => role.permissions?.has?.(p));
        const data = this.buildEventData({
            eventType: "role_create",
            guild: role.guild,
            extra: {
                role: { id: role.id, name: role.name, permissions: role.permissions?.toArray?.() ?? [] },
                force_review: hasHighPerm
            }
        });
        await this.handleEvent("role_create", role.guild, data, {
            userId: null,
            channelId: null,
            messageId: null
        });
    }

    public async handleRoleUpdate(oldRole: any, newRole: any) {
        if (!newRole?.guild) return;
        const data = this.buildEventData({
            eventType: "role_update",
            guild: newRole.guild,
            extra: {
                old_role: { id: oldRole.id, name: oldRole.name, permissions: oldRole.permissions?.toArray?.() ?? [] },
                new_role: { id: newRole.id, name: newRole.name, permissions: newRole.permissions?.toArray?.() ?? [] },
                force_review: true
            }
        });
        await this.handleEvent("role_update", newRole.guild, data, {
            userId: null,
            channelId: null,
            messageId: null
        });
    }

    public async handleRoleDelete(role: any) {
        if (!role?.guild) return;
        const data = this.buildEventData({
            eventType: "role_delete",
            guild: role.guild,
            extra: {
                role: { id: role.id, name: role.name, permissions: role.permissions?.toArray?.() ?? [] },
                force_review: true
            }
        });
        await this.handleEvent("role_delete", role.guild, data, {
            userId: null,
            channelId: null,
            messageId: null
        });
    }

    public async handleWebhookUpdate(channel: any) {
        if (!channel?.guild) return;
        const data = this.buildEventData({
            eventType: "webhook_update",
            guild: channel.guild,
            channelId: channel.id,
            extra: { force_review: true }
        });
        await this.handleEvent("webhook_update", channel.guild, data, {
            userId: null,
            channelId: channel.id,
            messageId: null
        });
    }

    public async handleGuildBanAdd(guild: Guild, user: any) {
        const data = this.buildEventData({
            eventType: "guild_ban_add",
            guild,
            extra: { user: { id: user?.id, tag: user?.tag }, force_review: true }
        });
        await this.handleEvent("guild_ban_add", guild, data, {
            userId: user?.id ?? null,
            channelId: null,
            messageId: null
        });
    }

    public async handleGuildBanRemove(guild: Guild, user: any) {
        const data = this.buildEventData({
            eventType: "guild_ban_remove",
            guild,
            extra: { user: { id: user?.id, tag: user?.tag }, force_review: true }
        });
        await this.handleEvent("guild_ban_remove", guild, data, {
            userId: user?.id ?? null,
            channelId: null,
            messageId: null
        });
    }

    public async handleMessageDeleteBulk(guild: Guild, channelId: string, count: number) {
        const data = this.buildEventData({
            eventType: "message_delete_bulk",
            guild,
            channelId,
            extra: { count, force_review: true }
        });
        await this.handleEvent("message_delete_bulk", guild, data, {
            userId: null,
            channelId,
            messageId: null
        });
    }

    public async handleChannelCreate(channel: any) {
        if (!channel?.guild) return;
        const typeName = ChannelType[channel.type as keyof typeof ChannelType] ?? String(channel.type);
        const suspiciousName = /(spam|raid|giveaway|free|nitro|drop|airdrop)/i.test(channel.name || "");
        const data = this.buildEventData({
            eventType: "channel_create",
            guild: channel.guild,
            channelId: channel.id,
            extra: {
                name: channel.name,
                type: typeName,
                force_review: suspiciousName
            }
        });
        await this.handleEvent("channel_create", channel.guild, data, {
            userId: null,
            channelId: channel.id,
            messageId: null
        });
    }

    public async handleChannelDelete(channel: any) {
        if (!channel?.guild) return;
        const typeName = ChannelType[channel.type as keyof typeof ChannelType] ?? String(channel.type);
        const data = this.buildEventData({
            eventType: "channel_delete",
            guild: channel.guild,
            channelId: channel.id,
            extra: { name: channel.name, type: typeName, force_review: true }
        });
        await this.handleEvent("channel_delete", channel.guild, data, {
            userId: null,
            channelId: channel.id,
            messageId: null
        });
    }

    public async handleChannelUpdate(oldChannel: any, newChannel: any) {
        if (!newChannel?.guild) return;
        const typeName = ChannelType[newChannel.type as keyof typeof ChannelType] ?? String(newChannel.type);
        const nameChanged = oldChannel?.name !== newChannel?.name;
        const data = this.buildEventData({
            eventType: "channel_update",
            guild: newChannel.guild,
            channelId: newChannel.id,
            extra: {
                old_name: oldChannel?.name ?? null,
                new_name: newChannel?.name ?? null,
                type: typeName,
                force_review: nameChanged
            }
        });
        await this.handleEvent("channel_update", newChannel.guild, data, {
            userId: null,
            channelId: newChannel.id,
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
        const config = await this.getConfig(record.guild_id);
        const labelConfig = await this.getLogLabels(config?.monitor_language ?? "en");
        if (event === "aimon_solve") {
            await this.markCase(caseId, "solved", interaction.user.id);
            await this.disableButtons(interaction, labelConfig.buttons);
            await interaction.reply({ content: "Marked as solved.", ephemeral: true });
            return true;
        }
        const guild = this.client.guilds.cache.get(record.guild_id);
        if (!guild) {
            await interaction.reply({ content: "Guild not found.", ephemeral: true });
            return true;
        }
        const payload = record.action_payload ? JSON.parse(record.action_payload) : {};
        const actions: ActionType[] = Array.isArray(payload.recommended_actions)
            ? payload.recommended_actions
            : (record.recommended_action ? [record.recommended_action] : ["notify"]);
        const actionable = actions.filter((a: ActionType) => a !== "notify");
        if (actionable.length === 0) {
            await interaction.reply({ content: "No action recommended for this case.", ephemeral: true });
            return true;
        }
        const results: string[] = [];
        for (const action of actionable.slice(0, 2)) {
            const result = await this.executeAction(guild, action, {
                userId: payload.userId ?? record.user_id,
                channelId: payload.channelId ?? record.channel_id,
                messageId: payload.messageId ?? record.message_id,
                reason: payload.reason ?? record.reason,
                warnMessage: payload.warnMessage ?? null,
                durationMs: payload.durationMs ?? null
            });
            results.push(`${action}: ${result.ok ? "ok" : "failed"} (${result.detail})`);
        }
        await this.markCase(caseId, "actioned", interaction.user.id);
        await this.disableButtons(interaction, labelConfig.buttons);
        await interaction.reply({ content: `Actions executed: ${results.join("; ")}`, ephemeral: true });
        return true;
    }

    private async disableButtons(interaction: any, labels?: { actionLabel: string; solveLabel: string }) {
        const message = interaction.message;
        if (!message) return;
        const actionLabel = labels?.actionLabel ?? "Automatically take action";
        const solveLabel = labels?.solveLabel ?? "Mark as solved";
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId("aimon_action_disabled").setLabel(actionLabel).setStyle(ButtonStyle.Danger).setDisabled(true),
            new ButtonBuilder().setCustomId("aimon_solve_disabled").setLabel(solveLabel).setStyle(ButtonStyle.Secondary).setDisabled(true)
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
