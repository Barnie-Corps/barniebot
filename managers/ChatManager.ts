import { Attachment, Collection, Guild, JSONEncodable, Message, User, WebhookClient } from "discord.js";
import client from "..";
import db from "../mysql/database";
import EventEmitter from "events";
import { ChatManagerOptions } from "../types/interfaces";
import langs from "langs";
import utils from "../utils";
import Log from "../Log";
import data from "../data";
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

export default class ChatManager extends EventEmitter {
    private cache = new Collection<string, any>();
    private ratelimits = new Collection<string, any>();
    private normal_interval: NodeJS.Timer = setInterval(() => { }, 1000);
    private ratelimit_interval: NodeJS.Timer = setInterval(() => { }, 1000);
    private guildCache: { expires: number, data: any[] } | null = null;
    private languageCache = new Collection<string, { expires: number, lang: string }>();
    private webhookCache = new Collection<string, WebhookClient>();
    constructor(public options: ChatManagerOptions = DefaultChatManagerOptions) {
        super();
        this.clear_times_function = this.clear_times_function.bind(this);
        this.clear_limit_times_function = this.clear_limit_times_function.bind(this);
        this.normal_interval = setInterval(this.clear_times_function, 1000);
        this.ratelimit_interval = setInterval(this.clear_limit_times_function, 1000);
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
        if (blacklist.has(message.author.id)) { message.reply("No."); return Log.info("Ignoring blacklisted user.", { userId: message.author.id }) }
        if (this.isRatelimited(message.author.id)) return Log.info(`Ignoring user ${message.author.username} as they're ratelimited.`, { userId: message.author.id, username: message.author.username });
        const start = Date.now();
        const reactionPromise = message.react(data.bot.loadingEmoji.id).catch(error => {
            Log.warn(`Failed to add processing reaction to message ${message.id}`, { messageId: message.id, error: error?.message ?? error });
            return null;
        });
        const [guilds, userLanguage, baseContent] = await Promise.all([
            this.getActiveGuilds(),
            this.getUserLanguage(message.author.id),
            this.resolveMessageContent(message)
        ]);
        const normalizedUserLanguage = userLanguage.toLowerCase();
        const languageName = this.resolveLanguageName(userLanguage);
        const hasTextContent = baseContent.trim().length > 0;
        let sanitizedDefaultContent = this.sanitizeContent(baseContent);
        if (!sanitizedDefaultContent || !sanitizedDefaultContent.trim().length) sanitizedDefaultContent = "*Attachment*";
        const files = message.attachments.size ? Array.from(message.attachments.values()) : undefined;
        const senderUsername = data.bot.owners.includes(message.author.id) ? `[OWNER] ${message.author.displayName}` : message.author.displayName;
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
        const primeTranslations: Promise<string>[] = Array.from(uniqueTargets.values()).map(tl => getTranslatedContent(tl));

        const tasks = guilds
            .filter((graw: any) => graw.guild !== message.guildId)
            .map(async (graw: any) => {
            const guild = client.guilds.cache.get(graw.guild) as Guild | undefined;
            if (!guild) {
                await db.query("DELETE FROM globalchats WHERE guild = ?", [graw.guild]);
                this.invalidateGuildCache();
                return;
            }
                const targetLanguage = typeof graw.language === "string" ? graw.language : String(graw.language ?? "");
                const shouldTranslate = Boolean(graw.autotranslate) && targetLanguage && targetLanguage.toLowerCase() !== normalizedUserLanguage;
            const webhook = this.getWebhook(graw);
                const contentToSend = shouldTranslate ? await getTranslatedContent(targetLanguage) : sanitizedDefaultContent;
                const payload: any = {
                    username: senderUsername,
                    avatarURL: senderAvatarURL,
                    content: contentToSend,
                    allowedMentions: { parse: [] }
                };
                if (files) payload.files = files;
            try {
                await webhook.send(payload);
            }
            catch (error: any) {
                failed = true;
                Log.warn(`Couldn't send global message to guild ${guild.name}`, { guildId: guild.id, guildName: guild.name });
                this.webhookCache.delete(graw.webhook_id);
                if (error?.stack) console.log(error.stack);
                throw error;
            }
            });
        await Promise.allSettled(tasks);
        const dispatchEnd = Date.now();
        const content = utils.encryptWithAES(data.bot.encryption_key, message.content);
        const insertPromise = db.query("INSERT INTO global_messages SET ?", [{ uid: message.author.id, content: content || "[EMPTY MESSAGE]", language: userLanguage }]);
        const removalPromise = message.reactions.removeAll().catch(error => {
            Log.warn(`Failed to clear reactions for message ${message.id}`, { messageId: message.id, error: error?.message ?? error });
            return null;
        });
        await Promise.all([insertPromise, removalPromise, reactionPromise]);
        if (failed) {
            await message.react("800125816633557043");
            await message.react("869607044892741743");
        }
        const totalDuration = Date.now() - start;
        const dispatchTime = dispatchEnd - start;
        if (dispatchTime >= 900) Log.info(`Slow dispatch of message with ID ${message.id} from author ${message.author.username}`, { 
            messageId: message.id, 
            authorId: message.author.id, 
            username: message.author.username,
            dispatchTime: dispatchTime,
            totalDuration,
            slow: true
        });
        else Log.info(`Message dispatch completed`, { 
            messageId: message.id, 
            authorId: message.author.id, 
            username: message.author.username,
            dispatchTime: dispatchTime,
            totalDuration
        });
    };
    public async announce(message: string, language: string, attachments?: Collection<string, Attachment>): Promise<void> {
        const guilds = await this.getActiveGuilds();
        if (guilds.length === 0) return;
        const files = attachments?.size ? Array.from(attachments.values()) : undefined;
        const normalizedLanguage = (language ?? "en").toLowerCase();
        const sourceLanguageName = langs.where("1", language)?.name ?? language;
        const hasTextContent = message.trim().length > 0;
        let sanitizedDefaultContent = message;
        if (!sanitizedDefaultContent || !sanitizedDefaultContent.trim().length) sanitizedDefaultContent = "*Attachment*";
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
        const primeTranslations: Promise<string>[] = Array.from(uniqueTargets.values()).map(tl => getTranslatedContent(tl));

        const tasks = guilds.map(async (graw: any) => {
            const guild = client.guilds.cache.get(graw.guild) as Guild | undefined;
            if (!guild) {
                Log.info(`Couldn't find guild with ID ${graw.guild}, this guild entry has been deleted.`, { guildId: graw.guild });
                await db.query("DELETE FROM globalchats WHERE guild = ?", [graw.guild]);
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
            if (files) payload.files = files;
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
        for (const [k, v] of this.cache.entries()) {
            const newv = v;
            if (v.time_left === 0) {
                this.cache.delete(k);
                continue;
            }
            newv.time_left -= 1000;
            this.cache.set(k, newv);
            continue;
        }
    };
    private async clear_limit_times_function(): Promise<void> {
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
            continue;
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
                    return sanitized;
                }
                catch (error: any) {
                    Log.warn("Failed to translate global message", { sourceLanguage, targetLanguage, error: error?.message ?? error });
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
        const webhook = new WebhookClient({ id: graw.webhook_id, token: graw.webhook_token });
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
};
