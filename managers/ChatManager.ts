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
const blacklist: string[] = ["1204899276229058625"];

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
        if (blacklist.includes(message.author.id)) { message.reply("No."); return Log.info("bot", "Ignoring blacklisted user.") }
        if (this.isRatelimited(message.author.id)) return Log.info("bot", `Ignoring user ${message.author.username} as they're ratelimited.`);
        const start = Date.now();
        let guilds: any = await db.query("SELECT * FROM globalchats WHERE enabled = TRUE");
        let userLanguage: any = (await db.query("SELECT * FROM languages WHERE userid = ?", [message.author.id]) as any)[0]?.lang ?? "es";
        const parallelObject: any = {};
        guilds = guilds.sort((g1: any, g2: any) => {
            if (Number(g1.autotranslate) === 1 && Number(g2.autotranslate) !== 1) return 1;
            else if (Number(g2.autotranslate) === 1 && Number(g1.autotranslate) !== 1) return -1;
            else return 0;
        });
        await message.react("875107406462472212");
        for (const graw of guilds) {
            const g = client.guilds.cache.get(graw.guild) as Guild;
            if (g.id === message.guildId) continue;
            const c = g.channels.cache.get(graw.channel);
            const wh = new WebhookClient({ id: graw.webhook_id, token: graw.webhook_token });
            parallelObject[g.id] = async (done: any): Promise<any> => {
                let { content } = message;
                let texts = {
                    default: "Mensaje traducido del",
                    name: (await utils.translate(`Idioma ${langs.where("1", userLanguage)?.local}`, userLanguage, "es")).text.trim().split(" ").pop(),
                    time: "(este mensaje tardó 1 segundo(s) en llegar a este servidor)"
                }
                if (message.reference) {
                    const ref = await message.fetchReference();
                    content = `> ${ref.content}\n\`@${ref.author.username}\` ${content}`;
                }
                if (userLanguage !== graw.language && graw.autotranslate) {
                    if (graw.language !== "es") {
                        texts = await utils.autoTranslate(texts, "es", graw.language);
                    }
                    content = `${(await utils.translate(content, userLanguage, graw.language)).text}\n*${texts.default} ${texts.name}*`;
                }
                try {
                    content = content.replace(/(http|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:/~+#-]*[\w@?^=%&amp;/~+#-])?/g, "[LINK]");
                    await wh.send({
                        username: data.bot.owners.includes(message.author.id) ? `[OWNER] ${message.author.username}` : message.author.username,
                        avatarURL: message.author.displayAvatarURL(),
                        content: content || "*Attachment*",
                        allowedMentions: { parse: [] },
                        files: message.attachments.map(a => a)
                    });
                    // wh.editMessage(msg.id, `*${msg.content}\n${texts.time.replace("1", String((((new Date(msg.timestamp)).getTime() - (new Date(message.createdTimestamp).getTime())) / 1000).toFixed(1)))}*`);
                    done(null, true);
                }
                catch (err: any) {
                    Log.error("bot", `Couldn't send global message to guild ${g.name}`);
                    await message.reactions.removeAll();
                    message.react("800125816633557043");
                    message.react("869607044892741743");
                }
            };
        }
        const content = utils.encryptWithAES(data.bot.encryption_key, message.content);
        await db.query("INSERT INTO global_messages SET ?", [{ uid: message.author.id, content: content || "[EMPTY MESSAGE]", language: userLanguage }]);
        await utils.parallel(parallelObject);
        const end = Date.now();
        await message.reactions.removeAll();
        if ((end - start) >= 900) Log.info("chat-manager", `Slow dispatch of message with ID ${message.id} from author ${message.author.username} (${message.author.id}). Message dispatch took ${end - start} ms`, true);
        else Log.info("chat-manager", `Message with ID ${message.id} from author ${message.author.username} (${message.author.id}) dispatched in ${end - start} ms`);
    };
    public async announce(message: string, language: string, attachments?: Collection<string, Attachment>): Promise<void> {
        const guilds: any = await db.query("SELECT * FROM globalchats WHERE enabled = TRUE");
        const parallelObject: any = {};
        for (const graw of guilds) {
            const g = client.guilds.cache.get(graw.guild) as Guild;
            if (!g) {
                Log.info("chat-manager", `Couldn't find guild with ID ${graw.guild}, this guild entry has been deleted.`);
                await db.query("DELETE FROM globalchats WHERE guild = ?", [graw.guild]);
                continue;
            }
            const wh = new WebhookClient({ id: graw.webhook_id, token: graw.webhook_token });
            parallelObject[g.id] = async (done: any): Promise<any> => {
                if (graw.language !== language && graw.autotranslate) {
                    let texts = {
                        default: "Mensaje traducido del",
                        name: (await utils.translate(`Idioma ${langs.where("1", language)?.local}`, language, "es")).text.trim().split(" ").pop()
                    }
                    if (graw.language !== "es") {
                        texts = await utils.autoTranslate(texts, "es", graw.language);
                    }
                    texts.name = (await utils.translate(`Idioma ${texts.name}`, language, "es")).text.trim().split(" ").pop();
                    message = `${(await utils.translate(message, language, graw.language)).text}\n*${texts.default} ${texts.name}*`;
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
