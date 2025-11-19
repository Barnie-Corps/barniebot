import { Attachment, Collection, Guild, JSONEncodable, Message, User, WebhookClient } from "discord.js";
import client from "..";
import db from "../mysql/database";
import EventEmitter from "events";
import { ChatManagerOptions } from "../types/interfaces";
import langs from "langs";
import utils from "../utils";
import Log from "../Log";
import data from "../data";
import https from "https";
import dns from "dns";

// Windows DNS optimization - use system resolver instead of c-ares
if (process.platform === "win32") {
    dns.setDefaultResultOrder("verbatim");
}

const DefaultChatManagerOptions: ChatManagerOptions = {
    messages_limit: 10,
    time: 10000,
    ratelimit_time: 60000
}
const blacklist = new Set<string>(["1204899276229058625"]);
const GUILD_CACHE_TTL = 15000;
const LANGUAGE_CACHE_TTL = 600000;
const LINK_REGEX = /(http|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?/g;
const LANGUAGE_NAME_CACHE = new Map<string, string>();
const RANK_CACHE = new Map<string, { rank: string | null, expires: number }>();
const RANK_CACHE_TTL = 300000;
const BLACKLIST_CACHE = new Map<string, { value: boolean, expires: number }>();
const MUTE_CACHE = new Map<string, { value: boolean, until: number, expires: number }>();
const MODERATION_CACHE_TTL = 60000;

// Application-level translation cache for hot translations
const APP_TRANSLATION_CACHE = new Map<string, { text: string, expires: number }>();
const APP_TRANSLATION_CACHE_TTL = 600000; // 10 minutes
const APP_TRANSLATION_CACHE_LIMIT = 1000;

// Translation circuit breaker per-manager
let translationFailureCount = 0;
let lastTranslationFailure = 0;
const TRANSLATION_CIRCUIT_THRESHOLD = 15;
const TRANSLATION_CIRCUIT_TIMEOUT = 120000;

// Optimized for Windows - reduced maxSockets, increased timeout, FIFO scheduling
const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: process.platform === "win32" ? 50 : 150,
    maxFreeSockets: process.platform === "win32" ? 25 : 75,
    timeout: 30000,
    keepAliveMsecs: 30000,
    scheduling: 'fifo' // FIFO works better on Windows
});
interface QueuedMessage {
    message: Message<true>;
    priority: number;
    timestamp: number;
}

export default class ChatManager extends EventEmitter {
    private cache = new Collection<string, any>();
    private ratelimits = new Collection<string, any>();
    private normal_interval: NodeJS.Timer = setInterval(() => { }, 1000);
    private ratelimit_interval: NodeJS.Timer = setInterval(() => { }, 1000);
    private guildCache: { expires: number, data: any[] } | null = null;
    private languageCache = new Collection<string, { expires: number, lang: string }>();
    private webhookCache = new Collection<string, WebhookClient>();
    private messageQueue: QueuedMessage[] = [];
    private isProcessingQueue = false;
    private queueProcessor: NodeJS.Timer | null = null;
    constructor(public options: ChatManagerOptions = DefaultChatManagerOptions) {
        super();
        this.clear_times_function = this.clear_times_function.bind(this);
        this.clear_limit_times_function = this.clear_limit_times_function.bind(this);
        this.normal_interval = setInterval(this.clear_times_function, 1000);
        this.ratelimit_interval = setInterval(this.clear_limit_times_function, 1000);
        this.queueProcessor = setInterval(() => this.processMessageQueue(), 100);
        this.preloadGuildCache();
    }
    private async preloadGuildCache(): Promise<void> {
        try {
            await this.getActiveGuilds();
        } catch (error) {
            Log.warn("Failed to preload guild cache", { error });
        }
    }
    public async processUser(user: User): Promise<void> {
        if (!this.cache.has(user.id)) {
            this.cache.set(user.id, { uid: user.id, count: 1, time_left: this.options.time });
        }
        else {
            const cachedu = this.cache.get(user.id);
            cachedu.count += 1;
            this.cache.set(user.id, cachedu);
            if (cachedu.count === this.options.messages_limit && !this.isRatelimited(user.id)) {
                this.emit("limit-reached", cachedu);
            }
            else if (cachedu.count >= this.options.messages_limit && !this.isRatelimited(user.id)) {
                this.emit("limit-exceed", cachedu);
            }
            else this.cache.set(user.id, cachedu);
        }
    };
    public async processMessage(message: Message<true>): Promise<any> {
        if (blacklist.has(message.author.id) || await this.isUserBlacklistedCached(message.author.id)) {
            message.reply("No.");
            return Log.info("Ignoring blacklisted user.", { userId: message.author.id });
        }
        if (await this.isUserMutedCached(message.author.id)) {
            return Log.info("Ignoring muted user message.", { userId: message.author.id });
        }
        if (this.isRatelimited(message.author.id)) return Log.info(`Ignoring user ${message.author.username} as they're ratelimited.`, { userId: message.author.id, username: message.author.username });
        
        const guilds = await this.getActiveGuilds();
        const priority = guilds.length > 50 ? 1 : 0;
        
        this.messageQueue.push({
            message,
            priority,
            timestamp: Date.now()
        });
        
        message.react(data.bot.loadingEmoji.id).catch(() => {});
    }
    
    private async processMessageQueue(): Promise<void> {
        if (this.isProcessingQueue || this.messageQueue.length === 0) return;
        this.isProcessingQueue = true;
        
        this.messageQueue.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);
        
        const batch = this.messageQueue.splice(0, 5);
        
        await Promise.allSettled(batch.map(item => this.dispatchMessage(item.message)));
        
        this.isProcessingQueue = false;
    }
    
    private async dispatchMessage(message: Message<true>): Promise<any> {
        const start = Date.now();
        const [guilds, userLanguage, baseContent] = await Promise.all([
            this.getActiveGuilds(),
            this.getUserLanguage(message.author.id),
            this.resolveMessageContent(message)
        ]);
        const normalizedUserLanguage = userLanguage.toLowerCase();
        const languageName = this.resolveLanguageName(userLanguage);
        const hasTextContent = baseContent.trim().length > 0;
        let sanitizedDefaultContent = this.sanitizeContent(baseContent);
        
        // Handle attachments: append URLs to content for webhook compatibility
        const hasAttachments = message.attachments.size > 0;
        const attachmentUrls = hasAttachments ? message.attachments.map(att => att.url).join('\n') : '';
        
        if (hasAttachments) {
            // Append attachment URLs to content (webhooks will auto-embed them)
            sanitizedDefaultContent = sanitizedDefaultContent.trim() 
                ? `${sanitizedDefaultContent}\n${attachmentUrls}` 
                : attachmentUrls;
        }
        
        // Fallback for truly empty messages
        if (!sanitizedDefaultContent || !sanitizedDefaultContent.trim().length) {
            sanitizedDefaultContent = "*Empty message*";
        }
    const rank = await this.getUserStaffRankCached(message.author.id);
    const suffix = utils.getRankSuffix(rank);
    const baseName = message.member?.nickname ?? message.author.displayName;
    const senderUsername = suffix ? `[${suffix}] ${baseName}` : utils.sanitizeStaffImpersonation(baseName);
        const senderAvatarURL = message.author.displayAvatarURL();
        const getTranslatedContent = this.createTranslationResolver(
            baseContent,
            userLanguage,
            languageName,
            sanitizedDefaultContent,
            hasTextContent
        );
        let failed = false;
        const uniqueTargets = new Set<string>();
        for (const graw of guilds) {
            if (graw.guild === message.guildId) continue;
            const targetLanguage = typeof graw.language === "string" ? graw.language : String(graw.language ?? "");
            const shouldTranslate = Boolean(graw.autotranslate) && targetLanguage && targetLanguage.toLowerCase() !== normalizedUserLanguage;
            if (shouldTranslate) uniqueTargets.add((targetLanguage ?? "").toLowerCase());
        }
        const primePromises = Array.from(uniqueTargets.values()).map(tl => getTranslatedContent(tl));
        await Promise.all(primePromises);

        const filtered = guilds.filter((graw: any) => graw.guild !== message.guildId);
        const BATCH_SIZE = 30;
        const batches: any[][] = [];
        for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
            batches.push(filtered.slice(i, i + BATCH_SIZE));
        }
        
        for (const batch of batches) {
            const batchTasks = batch.map(async (graw: any) => {
            const guild = client.guilds.cache.get(graw.guild) as Guild | undefined;
            if (!guild) {
                Promise.resolve(db.query("DELETE FROM globalchats WHERE guild = ?", [graw.guild])).catch(() => {});
                this.invalidateGuildCache();
                return;
            }
            const targetLanguage = typeof graw.language === "string" ? graw.language : String(graw.language ?? "");
            const shouldTranslate = Boolean(graw.autotranslate) && targetLanguage && targetLanguage.toLowerCase() !== normalizedUserLanguage;
            const webhook = this.getWebhook(graw);
            const contentToSend = shouldTranslate ? await getTranslatedContent(targetLanguage) : sanitizedDefaultContent;
            try {
                await webhook.send({
                    username: senderUsername,
                    avatarURL: senderAvatarURL,
                    content: contentToSend,
                    allowedMentions: { parse: [] }
                });
            }
            catch (error: any) {
                failed = true;
                this.webhookCache.delete(graw.webhook_id);
            }
            });
            await Promise.allSettled(batchTasks);
        }
        const dispatchEnd = Date.now();
        const content = utils.encryptWithAES(data.bot.encryption_key, message.content);
        Promise.resolve(db.query("INSERT INTO global_messages SET ?", [{ uid: message.author.id, content: content || "[EMPTY MESSAGE]", language: userLanguage }])).catch(() => {});
        await message.reactions.removeAll().catch(() => null);
        if (failed) {
            message.react("800125816633557043").catch(() => {});
            message.react("869607044892741743").catch(() => {});
        }
        const dispatchTime = dispatchEnd - start;
        if (dispatchTime >= 900) Log.info(`Slow dispatch of message with ID ${message.id} from author ${message.author.username}`, { 
            messageId: message.id, 
            authorId: message.author.id, 
            username: message.author.username,
            dispatchTime: dispatchTime,
            totalDuration: Date.now() - start,
            slow: true
        });
        else Log.info(`Message dispatch completed`, { 
            messageId: message.id, 
            authorId: message.author.id, 
            username: message.author.username,
            dispatchTime: dispatchTime,
            totalDuration: Date.now() - start
        });
    };
    public async announce(message: string, language: string, attachments?: Collection<string, Attachment>): Promise<void> {
        const guilds = await this.getActiveGuilds();
        if (guilds.length === 0) return;
        
        // Handle attachments by appending URLs to content
        const hasAttachments = attachments && attachments.size > 0;
        const attachmentUrls = hasAttachments ? attachments.map(att => att.url).join('\n') : '';
        
        const normalizedLanguage = (language ?? "en").toLowerCase();
        const sourceLanguageName = langs.where("1", language)?.name ?? language;
        let sanitizedDefaultContent = message.trim();
        
        // Append attachment URLs to content
        if (hasAttachments) {
            sanitizedDefaultContent = sanitizedDefaultContent 
                ? `${sanitizedDefaultContent}\n${attachmentUrls}` 
                : attachmentUrls;
        }
        
        // Fallback for truly empty messages
        if (!sanitizedDefaultContent || !sanitizedDefaultContent.trim().length) {
            sanitizedDefaultContent = "*Empty message*";
        }
        
        const hasTextContent = message.trim().length > 0;
        const getTranslatedContent = this.createTranslationResolver(
            message,
            language,
            sourceLanguageName,
            sanitizedDefaultContent,
            hasTextContent
        );
        const botUsername = client.user?.username;
        const botAvatarURL = client.user?.displayAvatarURL();
        const uniqueTargets = new Set<string>();
        for (const graw of guilds) {
            const targetLanguage = typeof graw.language === "string" ? graw.language : String(graw.language ?? "");
            const shouldTranslate = Boolean(graw.autotranslate) && targetLanguage && targetLanguage.toLowerCase() !== normalizedLanguage;
            if (shouldTranslate) uniqueTargets.add((targetLanguage ?? "").toLowerCase());
        }
        const primePromises = Array.from(uniqueTargets.values()).map(tl => getTranslatedContent(tl));
        await Promise.all(primePromises);

        const tasks = guilds.map(async (graw: any) => {
            const guild = client.guilds.cache.get(graw.guild) as Guild | undefined;
            if (!guild) {
                Promise.resolve(db.query("DELETE FROM globalchats WHERE guild = ?", [graw.guild])).catch(() => {});
                this.invalidateGuildCache();
                return;
            }
            const webhook = this.getWebhook(graw);
            const targetLanguage = typeof graw.language === "string" ? graw.language : String(graw.language ?? "");
            const shouldTranslate = Boolean(graw.autotranslate) && targetLanguage && targetLanguage.toLowerCase() !== normalizedLanguage;
            const contentToSend = shouldTranslate ? await getTranslatedContent(targetLanguage) : sanitizedDefaultContent;
            const payload: any = {
                username: botUsername,
                avatarURL: botAvatarURL,
                content: contentToSend,
                allowedMentions: { parse: [] }
            };
            try {
                await webhook.send(payload);
            }
            catch (error: any) {
                Log.warn(`Couldn't send global message to guild ${guild.name}`, { guildId: guild.id, guildName: guild.name });
                this.webhookCache.delete(graw.webhook_id);
            }
        });
        await Promise.allSettled(tasks);
    }
    private async clear_times_function(): Promise<void> {
        try {
            const users: Array<{ uid: string; time_left: number }> = [];
            for (const [k, v] of this.cache.entries()) users.push({ uid: k, time_left: v.time_left });
            if (users.length === 0) return;
            const result: any = await utils.processRateLimitsWorker(users, [], 1000);
            for (const uid of (result?.users?.expired ?? [])) this.cache.delete(uid);
            for (const updated of (result?.users?.keep ?? [])) {
                const original = this.cache.get(updated.uid) || {};
                this.cache.set(updated.uid, { ...original, time_left: updated.time_left });
            }
        } catch (_err) {
            for (const [k, v] of this.cache.entries()) {
                const newv = v;
                if (v.time_left === 0) { this.cache.delete(k); continue; }
                newv.time_left -= 1000;
                this.cache.set(k, newv);
            }
        }
    };
    private async clear_limit_times_function(): Promise<void> {
        try {
            const limits: Array<{ uid: string; time_left: number; username: string }> = [];
            for (const [k, v] of this.ratelimits.entries()) limits.push({ uid: k, time_left: v.time_left, username: v.username });
            if (limits.length === 0) return;
            const result: any = await utils.processRateLimitsWorker([], limits, 1000);
            for (const exp of (result?.limits?.expired ?? [])) {
                this.ratelimits.delete(exp.uid);
                Log.info(`User removed from ratelimit`, { userId: exp.uid });
                await this.announce(`Ratelimit for user ${exp.username} has been removed.`, "en");
            }
            for (const updated of (result?.limits?.keep ?? [])) {
                const original = this.ratelimits.get(updated.uid) || {};
                this.ratelimits.set(updated.uid, { ...original, time_left: updated.time_left, username: updated.username });
            }
        } catch (_err) {
            for (const [k, v] of this.ratelimits.entries()) {
                const newv = v;
                if (v.time_left === 0) {
                    this.ratelimits.delete(k);
                    Log.info(`User removed from ratelimit`, { userId: k });
                    await this.announce(`Ratelimit for user ${v.username} has been removed.`, "en");
                    continue;
                }
                newv.time_left -= 1000;
                this.ratelimits.set(k, newv);
            }
        }
    };
    public isRatelimited(uid: string): boolean {
        return this.ratelimits.has(uid);
    };
    public get DefaultChatManagerOptions(): ChatManagerOptions {
        return DefaultChatManagerOptions;
    };
    public async ratelimit(uid: string, username: string): Promise<void> {
        this.ratelimits.set(uid, { uid, time_left: this.options.ratelimit_time, username });
        await this.announce(`The user ${username} has been ratelimited for ${this.options.ratelimit_time / 1000} seconds.`, "en");
    }
    private sanitizeContent(content: string): string {
        return content.replace(LINK_REGEX, "[LINK]");
    }
    private resolveLanguageName(languageCode: string): string {
        if (!languageCode) return languageCode;
        const normalized = languageCode.toLowerCase();
        const cached = LANGUAGE_NAME_CACHE.get(normalized);
        if (cached) return cached;
        const resolved = langs.where("1", languageCode)?.name ?? languageCode;
        LANGUAGE_NAME_CACHE.set(normalized, resolved);
        return resolved;
    }
    private async getActiveGuilds(): Promise<any[]> {
        const now = Date.now();
        if (this.guildCache && this.guildCache.expires > now) return this.guildCache.data;
    const guildsRaw: any = await db.query("SELECT * FROM globalchats WHERE enabled = TRUE");
    const guilds: any[] = Array.isArray(guildsRaw) ? [...guildsRaw] : [];
    const sorted = guilds.sort((g1: any, g2: any) => {
            if (Number(g1.autotranslate) === 1 && Number(g2.autotranslate) !== 1) return 1;
            if (Number(g2.autotranslate) === 1 && Number(g1.autotranslate) !== 1) return -1;
            return 0;
        });
        this.guildCache = { data: sorted, expires: now + GUILD_CACHE_TTL };
        return sorted;
    }
    private invalidateGuildCache(): void {
        this.guildCache = null;
    }
    private createTranslationResolver(baseContent: string, sourceLanguage: string, sourceLanguageName: string, sanitizedFallback: string, hasTextContent: boolean): (targetLanguage: string) => Promise<string> {
        const normalizedSource = (sourceLanguage ?? "").toLowerCase();
        const cache = new Map<string, Promise<string>>();
        const noticeTemplate = {
            default: "Message translated from",
            name: sourceLanguageName
        };
        // Resolve translated variants per language only once per dispatch round.
        return async (targetLanguage: string): Promise<string> => {
            if (!hasTextContent) return sanitizedFallback;
            const normalizedTarget = (targetLanguage ?? "").toLowerCase();
            if (!targetLanguage || normalizedTarget === normalizedSource) return sanitizedFallback;
            const cacheKey = normalizedTarget || targetLanguage;
            const cached = cache.get(cacheKey);
            if (cached) return cached;
            // Check app-level cache first
            const appCacheKey = `${sourceLanguage}:${targetLanguage}:${baseContent.substring(0, 100)}`;
            const now = Date.now();
            const appCached = APP_TRANSLATION_CACHE.get(appCacheKey);
            if (appCached && appCached.expires > now) {
                return appCached.text;
            }
            // Check circuit breaker
            if (translationFailureCount >= TRANSLATION_CIRCUIT_THRESHOLD) {
                if (now - lastTranslationFailure > TRANSLATION_CIRCUIT_TIMEOUT) {
                    translationFailureCount = 0;
                } else {
                    Log.warn("Translation circuit breaker active, using fallback", { failures: translationFailureCount });
                    return sanitizedFallback;
                }
            }
            const translationPromise = (async () => {
                try {
                    const [translatedContent, translatedNotice] = await Promise.all([
                        utils.translate(baseContent, sourceLanguage, targetLanguage),
                        normalizedTarget === "en"
                            ? Promise.resolve({ ...noticeTemplate })
                            : utils.autoTranslate({ ...noticeTemplate }, "en", targetLanguage)
                    ]);
                    const notice = normalizedTarget === "en" ? noticeTemplate : translatedNotice;
                    const noticeText = `*${notice.default} ${notice.name}*`;
                    const combined = translatedContent.text
                        ? `${translatedContent.text}\n${noticeText}`
                        : noticeText;
                    const sanitized = this.sanitizeContent(combined) || sanitizedFallback;
                    // Store in app-level cache
                    APP_TRANSLATION_CACHE.set(appCacheKey, { text: sanitized, expires: now + APP_TRANSLATION_CACHE_TTL });
                    // Cleanup app cache if too large
                    if (APP_TRANSLATION_CACHE.size > APP_TRANSLATION_CACHE_LIMIT) {
                        const toDelete: string[] = [];
                        for (const [key, val] of APP_TRANSLATION_CACHE.entries()) {
                            if (val.expires <= now) toDelete.push(key);
                            if (toDelete.length >= 100) break;
                        }
                        toDelete.forEach(k => APP_TRANSLATION_CACHE.delete(k));
                    }
                    // Success - decay failure counter
                    if (translationFailureCount > 0) {
                        translationFailureCount = Math.max(0, translationFailureCount - 1);
                    }
                    return sanitized;
                }
                catch (error: any) {
                    translationFailureCount++;
                    lastTranslationFailure = Date.now();
                    Log.warn("Failed to translate global message", { sourceLanguage, targetLanguage, error: error?.message ?? error, failures: translationFailureCount });
                    return sanitizedFallback;
                }
            })();
            cache.set(cacheKey, translationPromise);
            return translationPromise;
        };
    }
    private async getUserLanguage(userId: string): Promise<string> {
        const now = Date.now();
        const cached = this.languageCache.get(userId);
        if (cached && cached.expires > now) return cached.lang;
        const result: any = await db.query("SELECT * FROM languages WHERE userid = ?", [userId]);
        const language = result?.[0]?.lang ?? "en";
        this.languageCache.set(userId, { lang: language, expires: now + LANGUAGE_CACHE_TTL });
        return language;
    }
    private getWebhook(graw: any): WebhookClient {
        const cached = this.webhookCache.get(graw.webhook_id);
        if (cached) return cached;
        const webhook = new WebhookClient({ 
            id: graw.webhook_id, 
            token: graw.webhook_token
        });
        this.webhookCache.set(graw.webhook_id, webhook);
        return webhook;
    }
    private async resolveMessageContent(message: Message<true>): Promise<string> {
        if (!message.reference) return message.content;
        try {
            const reference = await message.fetchReference();
            return `> ${reference.content}\n\`@${reference.author.displayName}\` ${message.content}`;
        }
        catch (_error) {
            return message.content;
        }
    }
    private async getUserStaffRankCached(userId: string): Promise<string | null> {
        const now = Date.now();
        const cached = RANK_CACHE.get(userId);
        if (cached && cached.expires > now) return cached.rank;
        const rank = await utils.getUserStaffRank(userId);
        RANK_CACHE.set(userId, { rank, expires: now + RANK_CACHE_TTL });
        return rank;
    }
    private async isUserBlacklistedCached(userId: string): Promise<boolean> {
        const now = Date.now();
        const cached = BLACKLIST_CACHE.get(userId);
        if (cached && cached.expires > now) return cached.value;
        const value = await utils.isUserBlacklisted(userId);
        BLACKLIST_CACHE.set(userId, { value, expires: now + MODERATION_CACHE_TTL });
        return value;
    }
    private async isUserMutedCached(userId: string): Promise<boolean> {
        const now = Date.now();
        const cached = MUTE_CACHE.get(userId);
        if (cached && cached.expires > now) {
            if (cached.until > 0 && now >= cached.until) {
                MUTE_CACHE.delete(userId);
                return false;
            }
            return cached.value;
        }
        const res: any = await db.query("SELECT * FROM global_mutes WHERE id = ?", [userId]);
        if (!Array.isArray(res) || !res[0]) {
            MUTE_CACHE.set(userId, { value: false, until: 0, expires: now + MODERATION_CACHE_TTL });
            return false;
        }
        const mute = res[0];
        const until = Number(mute.until) || 0;
        if (until > 0 && now >= until) {
            Promise.resolve(db.query("DELETE FROM global_mutes WHERE id = ?", [userId])).catch(() => {});
            MUTE_CACHE.set(userId, { value: false, until: 0, expires: now + MODERATION_CACHE_TTL });
            return false;
        }
        MUTE_CACHE.set(userId, { value: true, until, expires: now + MODERATION_CACHE_TTL });
        return true;
    }
};
