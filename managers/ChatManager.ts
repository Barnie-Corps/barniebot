import { Attachment, AttachmentPayload, Collection, Guild, JSONEncodable, Message, User, WebhookClient } from "discord.js";
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

export default class ChatManager extends EventEmitter {
    private cache = new Collection<string, any>();
    private ratelimits = new Collection<string, any>();
    private normal_interval: NodeJS.Timer = setInterval(() => { }, 1000);
    private ratelimit_interval: NodeJS.Timer = setInterval(() => { }, 1000);
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
        if (this.isRatelimited(message.author.id)) return Log.info("bot", `Ignoring user ${message.author.username} as it's ratelimited.`)
        const guilds: any = await db.query("SELECT * FROM globalchats WHERE enabled = TRUE");
        const userLanguage: any = await db.query("SELECT * FROM languages WHERE userid = ?", [message.author.id]);
        const parallelObject: any = {};
        for (const graw of guilds) {
            const g = client.guilds.cache.get(graw.guild) as Guild;
            if (g.id === message.guildId) continue;
            const c = g.channels.cache.get(graw.channel);
            const wh = new WebhookClient({ id: graw.webhook_id, token: graw.webhook_token });
            parallelObject[g.id] = async (done: any): Promise<any> => {
                let { content } = message;
                if (message.reference) {
                    const ref = await message.fetchReference();
                    content = `> ${ref.content}\n\`@${ref.author.username}\` ${content}`;
                }
                if (userLanguage[0]) {
                    if (userLanguage[0].lang !== graw.language && graw.autotranslate) {
                        content = `${(await utils.translate(content, userLanguage[0].lang, graw.language)).text}\n*Translated from ${langs.where("1", userLanguage[0].lang)?.name}*`;
                    }
                }
                try {
                    content = content.replace(/(http|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:/~+#-]*[\w@?^=%&amp;/~+#-])?/g, "[LINK]");
                    await wh.send({
                        username: data.bot.owners.includes(message.author.id) ? `[OWNER] ${message.author.username}` : message.author.username,
                        avatarURL: message.author.displayAvatarURL(),
                        content,
                        allowedMentions: { parse: [] },
                        files: message.attachments.map(a => a)
                    });
                }
                catch (err: any) {
                    Log.error("bot", `Couldn't send global message to guild ${g.name}`);
                }
            };
        }
        const content = utils.encryptWithAES(data.bot.encryption_key, message.content);
        await db.query("INSERT INTO global_messages SET ?", [{ uid: message.author.id, content, language: userLanguage[0] ? userLanguage[0].lang : "es" }]);
        await utils.parallel(parallelObject);
    };
    public async announce(message: string, language: string, attachments?: Collection<string, Attachment>): Promise<void> {
        const guilds: any = await db.query("SELECT * FROM globalchats WHERE enabled = TRUE");
        const parallelObject: any = {};
        for (const graw of guilds) {
            const g = client.guilds.cache.get(graw.guild) as Guild;
            const wh = new WebhookClient({ id: graw.webhook_id, token: graw.webhook_token });
            parallelObject[g.id] = async (done: any): Promise<any> => {
                if (graw.language !== language && graw.autotranslate) {
                    message = `${(await utils.translate(message, language, graw.language)).text}\n*Translated from ${langs.where(1, language)?.name}*`;
                }
                try {
                    await wh.send({
                        username: client.user?.username,
                        avatarURL: client.user?.displayAvatarURL(),
                        content: message,
                        allowedMentions: { parse: [] },
                        files: attachments?.map(a => a)
                    });
                }
                catch (err: any) {
                    Log.error("bot", `Couldn't send global message to guild ${g.name}`);
                }
                done(null, true);
            };
        }
        await utils.parallel(parallelObject);
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
                Log.info("bot", `User ID ${k} removed from ratelimit`);
                await this.announce(`User ${v.username} ratelimit has been removed.`, "en");
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
};