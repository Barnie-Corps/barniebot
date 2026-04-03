import { Attachment, Collection, Guild, JSONEncodable, Message, TextChannel, User, WebhookClient } from "discord.js";
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
import crypto from "crypto";
import cacheManager from "./CacheManager";
import type { QueuedMessage } from "../types/chat";
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
const RANK_CACHE_TTL = 300000;
const MODERATION_CACHE_TTL = 60000;
const APP_TRANSLATION_CACHE_TTL = 600000;

const CACHE_GUILDS_KEY = "barniebot:chat:guilds:active";
const CACHE_LANG_PREFIX = "barniebot:chat:lang:";
const CACHE_RANK_PREFIX = "barniebot:chat:rank:";
const CACHE_BLACKLIST_PREFIX = "barniebot:chat:blacklist:";
const CACHE_MUTE_PREFIX = "barniebot:chat:mute:";
const CACHE_TRANSLATION_PREFIX = "barniebot:chat:translation:";
const CACHE_LOCAL_GUILDS_KEY = "barniebot:local:chat:guilds:active";
const CACHE_LOCAL_LANG_PREFIX = "barniebot:local:chat:lang:";
const CACHE_LOCAL_WEBHOOK_PREFIX = "barniebot:local:chat:webhook:";
const CACHE_LOCAL_LANGUAGE_NAME_PREFIX = "barniebot:local:chat:language-name:";
const CACHE_LOCAL_APP_TRANSLATION_PREFIX = "barniebot:local:chat:app-translation:";
const CACHE_LOCAL_RANK_PREFIX = "barniebot:local:chat:rank:";
const CACHE_LOCAL_BLACKLIST_PREFIX = "barniebot:local:chat:blacklist:";
const CACHE_LOCAL_MUTE_PREFIX = "barniebot:local:chat:mute:";
const RATE_COUNTER_PREFIX = "barniebot:chat:rate:count:";
const RATE_LIMIT_PREFIX = "barniebot:chat:rate:limit:";
const WEBHOOK_USERNAME_LIMIT = 80;

let translationFailureCount = 0;
let lastTranslationFailure = 0;
const TRANSLATION_CIRCUIT_THRESHOLD = 15;
const TRANSLATION_CIRCUIT_TIMEOUT = 120000;

const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: process.platform === "win32" ? 50 : 150,
    maxFreeSockets: process.platform === "win32" ? 25 : 75,
    timeout: 30000,
    keepAliveMsecs: 30000,
    scheduling: 'fifo'
});
export default class ChatManager extends EventEmitter {
    private cache = new Collection<string, any>();
    private ratelimits = new Collection<string, any>();
    private normal_interval: NodeJS.Timer | null = null;
    private ratelimit_interval: NodeJS.Timer | null = null;
    private messageQueueHigh: QueuedMessage[] = [];
    private messageQueueLow: QueuedMessage[] = [];
    private isProcessingQueue = false;
    private queueScheduled = false;
    private activeGuildsPromise: Promise<any[]> | null = null;
    private userLanguagePromises = new Map<string, Promise<string>>();
    private userRankPromises = new Map<string, Promise<string | null>>();
    constructor(public options: ChatManagerOptions = DefaultChatManagerOptions) {
        super();
        this.clear_times_function = this.clear_times_function.bind(this);
        this.clear_limit_times_function = this.clear_limit_times_function.bind(this);
        this.ratelimit_interval = setInterval(this.clear_limit_times_function, 1000);
    }
    public async initialize(): Promise<void> {
        await this.preloadGuildCache();
    }

    private async cleanupFailedGlobalChat(guildId: string, webhookId?: string): Promise<void> {
        try {
            await db.query("DELETE FROM globalchats WHERE guild = ?", [guildId]);
            this.invalidateGuildCache();
            if (webhookId) cacheManager.deleteLocal(`${CACHE_LOCAL_WEBHOOK_PREFIX}${webhookId}`);
            Log.warn("Removed invalid globalchat target after delivery failure", { guildId, webhookId: webhookId ?? null });
        } catch (error) {
            Log.warn("Failed to cleanup invalid globalchat target", { guildId, error });
        }
    }
    private translationCacheKey(sourceLanguage: string, targetLanguage: string, baseContent: string): string {
        const digest = crypto.createHash("sha1").update(`${sourceLanguage}:${targetLanguage}:${baseContent}`).digest("hex");
        return `${CACHE_TRANSLATION_PREFIX}${digest}`;
    }
    private async preloadGuildCache(): Promise<void> {
        try {
            await this.getActiveGuilds();
        } catch (error) {
            Log.warn("Failed to preload guild cache", { error });
        }
    }
    private scheduleQueueProcess(): void {
        if (this.queueScheduled || this.isProcessingQueue) return;
        this.queueScheduled = true;
        setImmediate(() => {
            this.queueScheduled = false;
            Promise.resolve(this.processMessageQueue()).catch(() => { });
        });
    }
    public async processUser(user: User): Promise<void> {
        const counterKey = `${RATE_COUNTER_PREFIX}${user.id}`;
        const count = await cacheManager.increment(counterKey, this.options.time);
        if (count === null) return;
        const timeLeft = await cacheManager.getTtlMs(counterKey);
        const state = {
            uid: user.id,
            count,
            time_left: timeLeft > 0 ? timeLeft : this.options.time
        };
        if (count === this.options.messages_limit && !(await this.isRatelimited(user.id))) {
            this.emit("limit-reached", state);
            return;
        }
        if (count >= this.options.messages_limit && !(await this.isRatelimited(user.id))) {
            this.emit("limit-exceed", state);
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
        if (await this.isRatelimited(message.author.id)) return Log.info(`Ignoring user ${message.author.username} as they're ratelimited.`, { userId: message.author.id, username: message.author.username });

        const now = Date.now();
        const cachedGuilds = cacheManager.getLocal<any[]>(CACHE_LOCAL_GUILDS_KEY);
        const cachedGuildCount = Array.isArray(cachedGuilds) ? cachedGuilds.length : 0;
        const priority = cachedGuildCount > 50 ? 1 : 0;
        if (!cachedGuilds) {
            Promise.resolve(this.getActiveGuilds()).catch(() => { });
        }

        const entry = {
            message,
            priority,
            timestamp: Date.now()
        };
        if (priority > 0) {
            this.messageQueueHigh.push(entry);
        } else {
            this.messageQueueLow.push(entry);
        }
        this.scheduleQueueProcess();

        message.react(data.bot.loadingEmoji.id).catch(() => { });
    }

    public async Log(message: string, metadata?: any): Promise<void> {
        const LogChannel = client.channels.cache.get(data.bot.log_channel) as TextChannel | null;
        if (!LogChannel || !LogChannel.isTextBased()) return;
        const path = metadata && typeof metadata === "object" ? Object.entries(metadata).map(([k, v]) => `${k}=${v}`).join(" ") : "";
        if (path) message += `\n\`\`\`yaml\n${path}\n\`\`\``;
        LogChannel.send({ content: message }).catch(() => {
            Log.warn("Failed to send log message to log channel.", metadata);
        });
    }

    private async processMessageQueue(): Promise<void> {
        if (this.isProcessingQueue || (this.messageQueueHigh.length === 0 && this.messageQueueLow.length === 0)) return;
        this.isProcessingQueue = true;
        try {
            while (this.messageQueueHigh.length > 0 || this.messageQueueLow.length > 0) {
                const queueDepth = this.messageQueueHigh.length + this.messageQueueLow.length;
                const perTick = queueDepth >= 30 ? 8 : queueDepth >= 12 ? 6 : 4;
                const highCount = Math.min(this.messageQueueHigh.length, perTick);
                const highBatch = highCount > 0 ? this.messageQueueHigh.splice(0, highCount) : [];
                const lowCount = Math.min(this.messageQueueLow.length, perTick - highBatch.length);
                const lowBatch = lowCount > 0 ? this.messageQueueLow.splice(0, lowCount) : [];
                const batch = highBatch.length > 0 ? highBatch.concat(lowBatch) : lowBatch;
                if (batch.length === 0) break;
                await Promise.allSettled(batch.map(item => this.dispatchMessage(item.message)));
            }
        } finally {
            this.isProcessingQueue = false;
            if (this.messageQueueHigh.length > 0 || this.messageQueueLow.length > 0) {
                this.scheduleQueueProcess();
            }
        }
    }

    private async dispatchMessage(message: Message<true>): Promise<any> {
        const start = Date.now();
        const [guilds, userLanguage, baseContent, rank] = await Promise.all([
            this.getActiveGuilds(),
            this.getUserLanguage(message.author.id),
            this.resolveMessageContent(message),
            this.getUserStaffRankCached(message.author.id)
        ]);
        const normalizedUserLanguage = userLanguage.toLowerCase();
        const languageName = this.resolveLanguageName(userLanguage);
        const hasTextContent = baseContent.trim().length > 0;
        let sanitizedDefaultContent = this.sanitizeContent(baseContent);

        const hasAttachments = message.attachments.size > 0;
        const attachmentUrls = hasAttachments ? message.attachments.map(att => att.url).join('\n') : '';

        if (hasAttachments) {
            sanitizedDefaultContent = sanitizedDefaultContent.trim()
                ? `${sanitizedDefaultContent}\n${attachmentUrls}`
                : attachmentUrls;
        }

        if (!sanitizedDefaultContent || !sanitizedDefaultContent.trim().length) {
            sanitizedDefaultContent = "*Empty message*";
        }
        const senderUsername = this.normalizeWebhookUsername(rank, message.member?.nickname ?? message.author.displayName);
        const senderAvatarURL = message.author.displayAvatarURL();
        const getTranslatedContent = this.createTranslationResolver(
            baseContent,
            userLanguage,
            languageName,
            sanitizedDefaultContent,
            hasTextContent
        );
        let failed = false;

        const filtered = guilds.filter((graw: any) => graw.guild !== message.guildId);
        const guildConcurrency = filtered.length >= 150 ? 48 : filtered.length >= 80 ? 36 : 24;
        await this.runWithConcurrency(filtered, guildConcurrency, async (graw: any) => {
            const guild = client.guilds.cache.get(graw.guild) as Guild | undefined;
            if (!guild) {
                Promise.resolve(db.query("DELETE FROM globalchats WHERE guild = ?", [graw.guild])).catch(() => { });
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
                cacheManager.deleteLocal(`${CACHE_LOCAL_WEBHOOK_PREFIX}${graw.webhook_id}`);
                await this.cleanupFailedGlobalChat(graw.guild, graw.webhook_id);
            }
        });
        const dispatchEnd = Date.now();
        const content = utils.encryptWithAES(data.bot.encryption_key, message.content);
        Promise.resolve(db.query("INSERT INTO global_messages SET ?", [{ uid: message.author.id, content: content || "[EMPTY MESSAGE]", language: userLanguage }])).catch(() => { });
        Promise.resolve(message.reactions.removeAll()).catch(() => null);
        if (failed) {
            message.react("800125816633557043").catch(() => { });
            message.react("869607044892741743").catch(() => { });
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

        const hasAttachments = attachments && attachments.size > 0;
        const attachmentUrls = hasAttachments ? attachments.map(att => att.url).join('\n') : '';

        const normalizedLanguage = (language ?? "en").toLowerCase();
        const sourceLanguageName = langs.where("1", language)?.name ?? language;
        let sanitizedDefaultContent = message.trim();

        if (hasAttachments) {
            sanitizedDefaultContent = sanitizedDefaultContent
                ? `${sanitizedDefaultContent}\n${attachmentUrls}`
                : attachmentUrls;
        }

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
        const guildConcurrency = guilds.length >= 150 ? 48 : guilds.length >= 80 ? 36 : 24;
        await this.runWithConcurrency(guilds, guildConcurrency, async (graw: any) => {
            const guild = client.guilds.cache.get(graw.guild) as Guild | undefined;
            if (!guild) {
                Promise.resolve(db.query("DELETE FROM globalchats WHERE guild = ?", [graw.guild])).catch(() => { });
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
                cacheManager.deleteLocal(`${CACHE_LOCAL_WEBHOOK_PREFIX}${graw.webhook_id}`);
                await this.cleanupFailedGlobalChat(graw.guild, graw.webhook_id);
            }
        });
    }
    private async runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
        if (items.length === 0) return;
        const concurrency = Math.max(1, Math.min(limit, items.length));
        let index = 0;
        const runners = Array.from({ length: concurrency }, async () => {
            while (true) {
                const current = index;
                index += 1;
                if (current >= items.length) break;
                try {
                    await worker(items[current]);
                } catch {}
            }
        });
        await Promise.allSettled(runners);
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
                    Promise.resolve(cacheManager.delete(`${RATE_LIMIT_PREFIX}${k}`)).catch(() => { });
                    Log.info(`User removed from ratelimit`, { userId: k });
                    await this.announce(`Ratelimit for user ${v.username} has been removed.`, "en");
                    continue;
                }
                newv.time_left -= 1000;
                this.ratelimits.set(k, newv);
            }
        }
    };
    public async isRatelimited(uid: string): Promise<boolean> {
        if (this.ratelimits.has(uid)) return true;
        return cacheManager.has(`${RATE_LIMIT_PREFIX}${uid}`);
    };
    public get DefaultChatManagerOptions(): ChatManagerOptions {
        return DefaultChatManagerOptions;
    };
    public async ratelimit(uid: string, username: string): Promise<void> {
        if (await this.isRatelimited(uid)) return;
        this.ratelimits.set(uid, { uid, time_left: this.options.ratelimit_time, username });
        Promise.resolve(cacheManager.set(`${RATE_LIMIT_PREFIX}${uid}`, { uid }, this.options.ratelimit_time)).catch(() => { });
        await this.announce(`The user ${username} has been ratelimited for ${this.options.ratelimit_time / 1000} seconds.`, "en");
    }
    private sanitizeContent(content: string): string {
        return content.replace(LINK_REGEX, "[LINK]");
    }
    private normalizeWebhookUsername(rank: string | null, rawName: string): string {
        const baseName = utils.sanitizeStaffImpersonation(rawName).trim() || "Unknown User";
        const suffix = utils.getRankSuffix(rank);
        if (!suffix) return baseName.slice(0, WEBHOOK_USERNAME_LIMIT);
        const prefix = `[${suffix}] `;
        const remaining = Math.max(1, WEBHOOK_USERNAME_LIMIT - prefix.length);
        return `${prefix}${baseName.slice(0, remaining)}`;
    }
    private resolveLanguageName(languageCode: string): string {
        if (!languageCode) return languageCode;
        const normalized = languageCode.toLowerCase();
        const cacheKey = `${CACHE_LOCAL_LANGUAGE_NAME_PREFIX}${normalized}`;
        const cached = cacheManager.getLocal<string>(cacheKey);
        if (cached) return cached;
        const resolved = langs.where("1", languageCode)?.name ?? languageCode;
        cacheManager.setLocal(cacheKey, resolved, 86400000);
        return resolved;
    }
    private async getActiveGuilds(): Promise<any[]> {
        const localCached = cacheManager.getLocal<any[]>(CACHE_LOCAL_GUILDS_KEY);
        if (Array.isArray(localCached)) return localCached;
        if (this.activeGuildsPromise) return this.activeGuildsPromise;
        this.activeGuildsPromise = (async () => {
        const cached = await cacheManager.get<any[]>(CACHE_GUILDS_KEY);
        if (Array.isArray(cached)) {
            cacheManager.setLocal(CACHE_LOCAL_GUILDS_KEY, cached, GUILD_CACHE_TTL);
            return cached;
        }
        const guildsRaw: any = await db.query("SELECT * FROM globalchats WHERE enabled = TRUE");
        const guilds: any[] = Array.isArray(guildsRaw) ? [...guildsRaw] : [];
        const sorted = guilds.sort((g1: any, g2: any) => {
            if (Number(g1.autotranslate) === 1 && Number(g2.autotranslate) !== 1) return 1;
            if (Number(g2.autotranslate) === 1 && Number(g1.autotranslate) !== 1) return -1;
            return 0;
        });
        cacheManager.setLocal(CACHE_LOCAL_GUILDS_KEY, sorted, GUILD_CACHE_TTL);
        Promise.resolve(cacheManager.set(CACHE_GUILDS_KEY, sorted, GUILD_CACHE_TTL)).catch(() => { });
        return sorted;
        })();
        try {
            return await this.activeGuildsPromise;
        } finally {
            this.activeGuildsPromise = null;
        }
    }
    private invalidateGuildCache(): void {
        cacheManager.deleteLocal(CACHE_LOCAL_GUILDS_KEY);
        Promise.resolve(cacheManager.delete(CACHE_GUILDS_KEY)).catch(() => { });
    }
    private createTranslationResolver(baseContent: string, sourceLanguage: string, sourceLanguageName: string, sanitizedFallback: string, hasTextContent: boolean): (targetLanguage: string) => Promise<string> {
        const normalizedSource = (sourceLanguage ?? "").toLowerCase();
        const cache = new Map<string, Promise<string>>();
        const noticeTemplate = {
            default: "Message translated from",
            name: sourceLanguageName
        };
        return async (targetLanguage: string): Promise<string> => {
            if (!hasTextContent) return sanitizedFallback;
            const normalizedTarget = (targetLanguage ?? "").toLowerCase();
            if (!targetLanguage || normalizedTarget === normalizedSource) return sanitizedFallback;
            const localCacheKey = normalizedTarget || targetLanguage;
            const localCached = cache.get(localCacheKey);
            if (localCached) return localCached;
            const appCacheKey = `${sourceLanguage}:${targetLanguage}:${baseContent.substring(0, 100)}`;
            const now = Date.now();
            const appCached = cacheManager.getLocal<{ text: string }>(`${CACHE_LOCAL_APP_TRANSLATION_PREFIX}${appCacheKey}`);
            if (appCached?.text) return appCached.text;
            const cacheKey = this.translationCacheKey(sourceLanguage, targetLanguage, baseContent);
            const cached = await cacheManager.get<{ text: string }>(cacheKey);
            if (cached?.text) {
                cacheManager.setLocal(`${CACHE_LOCAL_APP_TRANSLATION_PREFIX}${appCacheKey}`, { text: cached.text }, APP_TRANSLATION_CACHE_TTL);
                return cached.text;
            }
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
                    cacheManager.setLocal(`${CACHE_LOCAL_APP_TRANSLATION_PREFIX}${appCacheKey}`, { text: sanitized }, APP_TRANSLATION_CACHE_TTL);
                    Promise.resolve(cacheManager.set(cacheKey, { text: sanitized }, APP_TRANSLATION_CACHE_TTL)).catch(() => { });
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
            cache.set(localCacheKey, translationPromise);
            return translationPromise;
        };
    }
    private async getUserLanguage(userId: string): Promise<string> {
        const localCacheKey = `${CACHE_LOCAL_LANG_PREFIX}${userId}`;
        const localCached = cacheManager.getLocal<{ lang: string }>(localCacheKey);
        if (localCached?.lang) return localCached.lang;
        const inflight = this.userLanguagePromises.get(userId);
        if (inflight) return inflight;
        const task = (async () => {
        const cacheKey = `${CACHE_LANG_PREFIX}${userId}`;
        const globalCached = await cacheManager.get<{ lang: string }>(cacheKey);
        if (globalCached?.lang) {
            cacheManager.setLocal(localCacheKey, { lang: globalCached.lang }, LANGUAGE_CACHE_TTL);
            return globalCached.lang;
        }
        const result: any = await db.query("SELECT * FROM languages WHERE userid = ?", [userId]);
        const language = result?.[0]?.lang ?? "en";
        cacheManager.setLocal(localCacheKey, { lang: language }, LANGUAGE_CACHE_TTL);
        Promise.resolve(cacheManager.set(cacheKey, { lang: language }, LANGUAGE_CACHE_TTL)).catch(() => { });
        return language;
        })();
        this.userLanguagePromises.set(userId, task);
        try {
            return await task;
        } finally {
            this.userLanguagePromises.delete(userId);
        }
    }
    private getWebhook(graw: any): WebhookClient {
        const cacheKey = `${CACHE_LOCAL_WEBHOOK_PREFIX}${graw.webhook_id}`;
        const cached = cacheManager.getLocal<WebhookClient>(cacheKey);
        if (cached) return cached;
        const webhook = new WebhookClient({
            id: graw.webhook_id,
            token: graw.webhook_token
        });
        cacheManager.setLocal(cacheKey, webhook, 3600000);
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
        const localCacheKey = `${CACHE_LOCAL_RANK_PREFIX}${userId}`;
        const localCached = cacheManager.getLocal<{ rank: string | null }>(localCacheKey);
        if (localCached && Object.prototype.hasOwnProperty.call(localCached, "rank")) return localCached.rank;
        const inflight = this.userRankPromises.get(userId);
        if (inflight) return inflight;
        const task = (async () => {
        const cacheKey = `${CACHE_RANK_PREFIX}${userId}`;
        const globalCached = await cacheManager.get<{ rank: string | null }>(cacheKey);
        if (globalCached && Object.prototype.hasOwnProperty.call(globalCached, "rank")) {
            cacheManager.setLocal(localCacheKey, { rank: globalCached.rank }, RANK_CACHE_TTL);
            return globalCached.rank;
        }
        const rank = await utils.getUserStaffRank(userId);
        cacheManager.setLocal(localCacheKey, { rank }, RANK_CACHE_TTL);
        Promise.resolve(cacheManager.set(cacheKey, { rank }, RANK_CACHE_TTL)).catch(() => { });
        return rank;
        })();
        this.userRankPromises.set(userId, task);
        try {
            return await task;
        } finally {
            this.userRankPromises.delete(userId);
        }
    }
    private async isUserBlacklistedCached(userId: string): Promise<boolean> {
        const localCacheKey = `${CACHE_LOCAL_BLACKLIST_PREFIX}${userId}`;
        const localCached = cacheManager.getLocal<{ value: boolean }>(localCacheKey);
        if (localCached && typeof localCached.value === "boolean") return localCached.value;
        const cacheKey = `${CACHE_BLACKLIST_PREFIX}${userId}`;
        const globalCached = await cacheManager.get<{ value: boolean }>(cacheKey);
        if (globalCached && typeof globalCached.value === "boolean") {
            cacheManager.setLocal(localCacheKey, { value: globalCached.value }, MODERATION_CACHE_TTL);
            return globalCached.value;
        }
        const value = await utils.isUserBlacklisted(userId);
        cacheManager.setLocal(localCacheKey, { value }, MODERATION_CACHE_TTL);
        Promise.resolve(cacheManager.set(cacheKey, { value }, MODERATION_CACHE_TTL)).catch(() => { });
        return value;
    }
    private async isUserMutedCached(userId: string): Promise<boolean> {
        const now = Date.now();
        const localCacheKey = `${CACHE_LOCAL_MUTE_PREFIX}${userId}`;
        const localCached = cacheManager.getLocal<{ value: boolean, until: number }>(localCacheKey);
        if (localCached && typeof localCached.value === "boolean") {
            if (localCached.until > 0 && now >= localCached.until) {
                cacheManager.deleteLocal(localCacheKey);
                return false;
            }
            return localCached.value;
        }
        const cacheKey = `${CACHE_MUTE_PREFIX}${userId}`;
        const globalCached = await cacheManager.get<{ value: boolean, until: number }>(cacheKey);
        if (globalCached && typeof globalCached.value === "boolean") {
            const until = Number(globalCached.until) || 0;
            if (until > 0 && now >= until) {
                cacheManager.deleteLocal(localCacheKey);
                Promise.resolve(cacheManager.delete(cacheKey)).catch(() => { });
                return false;
            }
            cacheManager.setLocal(localCacheKey, { value: globalCached.value, until }, MODERATION_CACHE_TTL);
            return globalCached.value;
        }
        const res: any = await db.query("SELECT * FROM global_mutes WHERE id = ?", [userId]);
        if (!Array.isArray(res) || !res[0]) {
            cacheManager.setLocal(localCacheKey, { value: false, until: 0 }, MODERATION_CACHE_TTL);
            Promise.resolve(cacheManager.set(cacheKey, { value: false, until: 0 }, MODERATION_CACHE_TTL)).catch(() => { });
            return false;
        }
        const mute = res[0];
        const until = Number(mute.until) || 0;
        if (until > 0 && now >= until) {
            Promise.resolve(db.query("DELETE FROM global_mutes WHERE id = ?", [userId])).catch(() => { });
            cacheManager.setLocal(localCacheKey, { value: false, until: 0 }, MODERATION_CACHE_TTL);
            Promise.resolve(cacheManager.set(cacheKey, { value: false, until: 0 }, MODERATION_CACHE_TTL)).catch(() => { });
            return false;
        }
        cacheManager.setLocal(localCacheKey, { value: true, until }, MODERATION_CACHE_TTL);
        Promise.resolve(cacheManager.set(cacheKey, { value: true, until }, MODERATION_CACHE_TTL)).catch(() => { });
        return true;
    }
};
