import { Message, TextChannel, WebhookClient } from "discord.js";
import data from "../data";
import db from "../mysql/database";
import { BotEmoji, ReplyFunction } from "../types/interfaces";
import utils from "../utils";
export default {
    data: {
        name: "gchat",
        description: "Con este comando puedes cambiar el canal del chat global e inhabilitarlo/habilitarlo.",
        aliases: ["globalchat", "chatglobal"],
        guildOnly: true,
        requiredGuildPermissions: ["ManageChannels"],
        category: "social"
    },
    execute: async (message: Message<true>, args: string[], reply: ReplyFunction, prefix: string, lang: string) => {
        const loadingMsg = await reply("Hm....");
        const validOptions = ["enable", "disable", "set"];
        if (!validOptions.includes(args[0])) return await reply("```\n" + `${prefix}gchat <option> <channel?>\n${utils.createSpaces(`${prefix}gchat <`.length)}${utils.createArrows("option".length)}\n\nERR: Missing required option.` + "\n```")
        const targetChannel = message.mentions.channels.first() ?? message.channel;
        const texts = {
            success: {
                enabled: "El chat global ha sido habilitado con éxito.",
                disabled: "El chat global ha sido deshabilitado con éxito.",
                set: "El canal del chat global ha sido establecido con éxito.",
                set_disabled: "El canal del chat global ha sido establecido, sin embargo, debido a que este estaba deshabilitado, ha sido habilitado de manera automática.",
                set_not_registered: "El canal del chat global ha sido establecido, sin embargo, debido a que este servidor no estaba registrado en la base de datos con respecto al chat global, ha sido registrado y el chat global se ha activado de manera automática."
            },
            unsuccess: {
                not_registered: "Este servidor no se encuentra en la base de datos con respecto al chat global, utiliza el comando gchat con la opción SET para registrarlo y habilitar esta función."
            }
        }
        await utils.parallel({
            success_texts: async function (callback: any) {
                if (lang !== "es") {
                    const { success } = texts;
                    success.enabled = await utils.translate(success.enabled, "es", lang);
                    success.disabled = await utils.translate(success.disabled, "es", lang);
                    success.set = await utils.translate(success.set, "es", lang);
                    success.set_disabled = await utils.translate(success.set_disabled, "es", lang);
                    success.set_not_registered = await utils.translate(success.set_not_registered, "es", lang);
                }
                callback(null, true);
            },
            unsuccess_texts: async function (callback: any) {
                if (lang !== "es") {
                    const { unsuccess } = texts;
                    unsuccess.not_registered = await utils.translate(unsuccess.not_registered, "es", lang);
                }
                callback(null, true);
            }
        });
        let gchatObject = ((await db.query("SELECT * FROM global_chats WHERE guild = ?", [message.guild?.id]) as unknown) as any[]);
        await loadingMsg.delete();
        switch (args[0]) {
            case "enable": {
                if (!gchatObject[0]) {
                    await reply(texts.unsuccess.not_registered);
                    break;
                }
                await db.query("UPDATE global_chats SET ? WHERE guild = ?", [{ active: true }, message.guild?.id]);
                await reply(texts.success.enabled);
            }
            case "disable": {
                if (!gchatObject[0]) {
                    await reply(texts.unsuccess.not_registered);
                    break;
                }
                await db.query("UPDATE global_chats SET ? WHERE guild = ?", [{ active: false }, message.guild?.id]);
                await reply(texts.success.disabled);
                break;
            }
            case "set": {
                if (!gchatObject[0]) {
                    const webhook = await (targetChannel as TextChannel).createWebhook({
                        name: "Global Chat"
                    });
                    await db.query("INSERT INTO global_chats SET ?", [{ guild: message.guild?.id, channel: targetChannel.id, webhook_id: webhook.id, webhook_token: webhook.token }]);
                    await reply(texts.success.set_not_registered);
                    break;
                }
                await db.query("UPDATE global_chats SET ? WHERE guild = ?", [{ active: true, channel: targetChannel.id }, message.guild?.id]);
                const oldChannel = gchatObject[0].channel;
                if (oldChannel !== targetChannel.id) {
                    const oldWebhook = new WebhookClient({ id: gchatObject[0].webhook_id, token: gchatObject[0].webhook_token });
                    if (oldWebhook) oldWebhook.delete("Changed Global Chat channel.");
                    const webhook = await (targetChannel as TextChannel).createWebhook({ name: "Global Chat" });
                    await db.query("UPDATE global_chats SET ? WHERE guild = ?", [{ webhook_id: webhook.id, webhook_token: webhook.token }]);
                }
                if (!gchatObject[0].active) {
                    await reply(texts.success.set_disabled);
                }
                else {
                    await reply(texts.success.set);
                }
            }
        }
    }
}