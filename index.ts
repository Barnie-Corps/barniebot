/**
 * Open source discord bot created by r3tr00_ (owner of Barnie Corps)
 * Please read the license at LICENSE in the root of the project.
 * It is highly recommended that you read the license before using this bot's code but if you do not, you can do so at https://opensource.org/licenses/MIT.
 * Here's a summary of the license:
 * The MIT License (MIT)
 * Copyright (c) 2022 Barnie Corps
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 * Also it's important to know that even though you can use this bot's code for your own purposes, you cannot claim it as your own and must give credit to the original creator.
 * See based.txt to get comments to put in your discord bot based on BarnieBot, you should put 'em but it's not completely necessary.
 * Certificate of registration: https://www.copyrighted.com/work/23e3X3GmrHeYiS1d
 */
import fetch from "node-fetch";
globalThis.fetch = fetch as any;
import * as dotenv from "dotenv";
dotenv.config();
import { EmbedBuilder, ActionRow, GatewayIntentBits, Client, ActivityType, Partials, PermissionFlagsBits, MessagePayload, WebhookClient, TextChannel, Message, time, TimestampStyles, ButtonInteraction, CacheType, TimestampStylesString } from "discord.js";
import * as fs from "fs";
import data from "./data";
import Log from "./Log";
import queries from "./mysql/queries";
import db from "./mysql/database";
import utils from "./utils";
import load_slash from "./load_slash";
import ChatManager from "./managers/ChatManager";
import Workers from "./Workers";
import path from "path";
import { inspect } from "util";
import langs from "langs";
import { Channel } from "diagnostics_channel";
const manager = new ChatManager();
process.on("uncaughtException", (err: any) => {
    console.log(`Unknown Error: ${err.stack}`);
});
process.on("unhandledRejection", (err: any) => {
    console.log(`Unknown Error: ${err.stack}`);
});
const client = new Client({
    intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMessageTyping, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.DirectMessages, GatewayIntentBits.DirectMessageTyping, GatewayIntentBits.DirectMessageReactions],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User]
});
(async function () {
    const commandsDir = fs.readdirSync("./commands").filter(f => f.endsWith(".ts"));
    for (const cmdFile of commandsDir) {
        try {
            const command = (await import(`./commands/${cmdFile.trim().split(".")[0]}`)).default;
            data.bot.commands.set(command.data.name, command);
        }
        catch (err: any) {
            Log.error("commands", `Couldn't load command file '${cmdFile}' properly due to an unexpected error:\n${err.stack}`);
        }
    }
    Log.success("commands", `Successfully loaded ${data.bot.commands.size}/${commandsDir.length} commands.`);
})();

client.on("ready", async (): Promise<any> => {
    Log.success("bot", `Successfully logged in at discord as ${client.user?.tag}`);
    queries();
    client.user?.setPresence({ activities: [{ name: `V ${String(process.env.VERSION)}`, type: ActivityType.Playing }] });
    await load_slash();
    Log.info("bot", `Current users cache size: ${client.users.cache.size}`);
    data.bot.owners.push(...String(process.env.OWNERS).trim().split(","));
    Log.info("bot", "Owners data loaded.");
    Log.info("bot", "Loading workers...");
    if (Number(process.env.SAFELY_SHUTTED_DOWN) === 0 && Number(process.env.NOTIFY_STARTUP) === 1) {
        await manager.announce("¡Hey! He sido reiniciado... Según mis registros, fue un reinicio forzado, por lo cual, no pude avisarles de éste. Lamentamos cualquier inconveniente o interrupción que esto haya causado.", "es");
    }
    else if (Number(process.env.NOTIFY_STARTUP) === 1) await manager.announce("¡He vuelto! El chat global está nuevamente en línea.", "es");
    Workers.bulkCreateWorkers(path.join(__dirname, "workers", "translate.js"), "translate", 5);
    fs.writeFileSync("./.env", fs.readFileSync('./.env').toString().replace("SAFELY_SHUTTED_DOWN=1", "SAFELY_SHUTTED_DOWN=0"));
});

client.on("messageCreate", async (message): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(message.author.id)) return;
    if (message.author.bot) return;
    const prefix = "b.";
    const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [message.author.id]) as unknown) as any[]);
    const Lang = foundLang[0] ? foundLang[0].lang : "es";
    if (message.content.toLowerCase().startsWith(prefix) && !data.bot.owners.includes(message.author.id)) {
        if (Lang === "es") {
            message.reply("Lo siento, los comandos de prefijo ya no son soportados.");
            return;
        }
        else {
            const reply = (await utils.translate("Lo siento, los comandos de prefijo ya no son soportados.", "es", Lang)).text;
            message.reply(reply);
            return;
        }
    }
    if (!message.content.toLowerCase().startsWith(prefix)) return;
    const [command, ...args] = message.content.slice(prefix.length).trim().split(" ");
    switch (command) {
        case "shutdown": {
            await manager.announce("¡Hey! Seré apagado en un segundo, lamentamos inconvenientes.", "es");
            fs.writeFileSync("./.env", fs.readFileSync('./.env').toString().replace("SAFELY_SHUTTED_DOWN=0", "SAFELY_SHUTTED_DOWN=1"));
            client.destroy();
            process.exit(0);
        }
        case "announce": {
            const [language, ...msg] = args;
            await manager.announce(msg.join(" "), language, message.attachments);
            break;
        }
        case "messages": {
            const [id] = args;
            const msg: any = await db.query("SELECT * FROM global_messages WHERE uid = ?", [id]);
            if (!msg[0]) return await message.reply("Not found.");
            const user = await client.users.fetch(msg[0].uid);
            fs.writeFileSync(`./messages_report_${user.id}.txt`, `Messages report for user ${user.username} (${user.id}) - ${msg.length} messages\n\n${msg.map((m: any) => `[${m.id}] ${user.username}: ${utils.decryptWithAES(data.bot.encryption_key, m.content)}`).join(`\n`)}`);
            await message.reply({ files: [`./messages_report_${user.id}.txt`] });
            fs.unlinkSync(`./messages_report_${user.id}.txt`);
            break;
        }
        case "invite": {
            const [sid] = args;
            const server = client.guilds.cache.get(sid);
            if (!server) return message.reply("Not found.");
            const channel = server.channels.cache.find(c => c.isTextBased());
            await message.reply({ content: (await channel?.guild.invites.create(channel as TextChannel, { maxAge: 0, maxUses: 0 }) as any).url });
            break;
        }
        case "guilds": {
            fs.writeFileSync("./guilds.txt", client.guilds.cache.map(g => `${g.name} | ${g.memberCount} | ${g.id}`).join("\n"));
            await message.reply({ files: ["./guilds.txt"] });
            fs.unlinkSync('./guilds.txt');
            break;
        }
        case "eval": {
            if (!data.bot.owners.includes(message.author.id)) return message.reply('no');
            const targetCode = args.slice(0).join(' ');
            if (!targetCode) return message.reply('You must provide a code to eval.');
            try {
                const start = Date.now();
                const evalued = eval(targetCode);
                const done = Date.now() - start;
                const embed = new EmbedBuilder()
                    .setColor("Green")
                    .setTitle('Code evaluated')
                    .addFields(
                        {
                            name: "**Output Type**:",
                            value: `\`\`\`prolog\n${typeof (evalued)}\`\`\``,
                            inline: true
                        },
                        {
                            name: "**Evaluated in:**",
                            value: `\`\`\`yaml\n${done}ms\`\`\``,
                            inline: true
                        },
                        {
                            name: "**Input**",
                            value: `\`\`\`js\n${targetCode}\`\`\``
                        },
                        {
                            name: "**Output**",
                            value: `\`\`\`js\n${inspect(evalued, { depth: 0 })}\`\`\``
                        }
                    )
                message.reply({ embeds: [embed] });
            }
            catch (error) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('Red')
                    .setTitle('ERROR')
                    .addFields(
                        {
                            name: "Input",
                            value: `\`\`\`js\n${targetCode}\`\`\``
                        },
                        {
                            name: "Error",
                            value: `\`\`\`js\n${error}\`\`\``
                        }
                    )
                message.reply({ embeds: [errorEmbed] });
                break;
            }
        }
        case "add_vip": {
            if (!args[0]) return await message.reply("You must provide the user ID.");
            const [uid, newTime, timeType] = args;
            if ([uid, newTime, timeType].some(v => !v)) return await message.reply("Missing arguments. Required arguments: ID TIME TIME_TYPE");
            const multiply = {
                seconds: 1,
                minutes: 60,
                hours: 3600,
                days: 86400,
            }
            if (isNaN(parseInt(uid))) return await message.reply("Invalid ID.");
            let validUser = false;
            try {
                await client.users.fetch(uid);
                validUser = true;
            }
            catch (error) {
                await message.reply("Invalid ID.");
                break;
            }
            if (isNaN(parseInt(newTime))) return await message.reply("Invalid time provided.");
            if (!Object.keys(multiply).some(m => m === timeType.toLowerCase())) return await message.reply(`Invalid time type provided. Supported types: \`${Object.keys(multiply).join(", ")}.\``);
            const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [uid]);
            const totalTime = (1000 * multiply[timeType as keyof typeof multiply]) * parseInt(newTime);
            const now = Date.now();
            const end = now + totalTime;
            if (foundVip[0]) {
                await db.query("UPDATE vip_users SET end_date = ? WHERE id = ?", [end, uid]);
                await message.reply(`VIP time has been updated to ${newTime} ${timeType} for user with ID ${uid}. ${time(Math.round(foundVip[0].end_date / 1000), TimestampStyles.ShortDate)} -> ${time(Math.round(end / 1000), TimestampStyles.ShortDate)} (Ends in ${time(Math.round(end / 1000), TimestampStyles.RelativeTime)})`);
                break;
            }
            else {
                await db.query("INSERT INTO vip_users SET ?", [{
                    id: uid,
                    start_date: now,
                    end_date: end,
                }]);
                await message.reply(`VIP has been added to user with ID ${uid} for ${newTime} ${timeType} -> ${time(Math.round(end / 1000), TimestampStyles.ShortDate)} (${time(Math.round(end / 1000), TimestampStyles.RelativeTime)})`);
                break;
            }
        }
    }
});
client.on("interactionCreate", async (interaction): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(interaction.user.id)) return;
    const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [interaction.user.id]) as unknown) as any[]);
    const Lang = foundLang[0] ? foundLang[0].lang : "es";
    let texts = {
        new: "Hey! Veo que es la primera vez que utilizas uno de mis comandos, por lo menos en esta cuenta jaja. Quiero decirte que no te olvides de leer mi política de privacidad!",
        error: "Whoops... Ha ocurrido un error inesperado, ya he reportado el error pero si éste persiste, puedes notificarlo en el siguiente enlace:",
        loading: "Traduciendo textos (puede tardar un tiempo)...",
        not_vip: "Hmm... No puedes ejecutar este comando si no eres VIP.",
        expired_vip: "¡Vaya! Al parecer tu suscripción VIP ha terminado. He revocado tu acceso VIP."
    }
    if (Lang !== "es") {
        texts = await utils.autoTranslate(texts, "es", Lang);
    }
    if (interaction.isCommand()) {
        const cmd = data.bot.commands.get(interaction.commandName as string);
        if (!cmd) {
            return await interaction.reply({ content: "```\n" + `/${interaction.commandName}\n ${utils.createArrows(`${interaction.command?.name}`.length)}\n\nERR: Unknown slash command` + "\n```", ephemeral: true });
        }
        try {
            await interaction.reply({ ephemeral: cmd.ephemeral as boolean, content: Lang !== "es" ? `${texts.loading} <a:discordproloading:875107406462472212>` : `<a:discordproloading:875107406462472212>` });
            await cmd.execute(interaction, Lang);
            await db.query("UPDATE executed_commands SET is_last = FALSE WHERE is_last = TRUE");
            await db.query("INSERT INTO executed_commands SET ?", [{ command: interaction.commandName, uid: interaction.user.id, at: Math.round(Date.now() / 1000) }]);
            const foundU: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [interaction.user.id]);
            const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [interaction.user.id]);
            if (foundVip[0] && foundVip[0].end_date <= Date.now()) {
                await db.query("DELETE FROM vip_users WHERE id = ?", [interaction.user.id]);
                await interaction.followUp({ content: texts.expired_vip, ephemeral: true });
            }
            if (foundU[0]) {
                await db.query("UPDATE discord_users SET command_executions = command_executions + 1, pfp = ?, username = ? WHERE id = ?", [interaction.user.displayAvatarURL({ size: 1024 }), interaction.user.username, interaction.user.id]);
            }
            else {
                await db.query("INSERT INTO discord_users SET ?", { id: interaction.user.id, pfp: interaction.user.displayAvatarURL({ size: 1024 }), username: interaction.user.username });
                const msg = await interaction.followUp({ content: `<@${interaction.user.id}>, ${texts.new}: [privacy.txt](https://github.com/Barnie-Corps/barniebot/blob/master/privacy.txt)`, ephemeral: true });
                await msg.removeAttachments();
            }
        }
        catch (err: any) {
            if (interaction.deferred || interaction.replied) {
                try {
                    await interaction.editReply(`${texts.error} https://discord.gg/BKFa6tFYJx`);
                }
                catch (err: any) {
                    Log.error("bot", `Couldn't send error message to user ${interaction.user.username}`);
                    await interaction.channel?.send(`<@${interaction.user.id}>, ${texts.error} https://discord.gg/BKFa6tFYJx`);
                }
            }
            else {
                try {
                    await interaction.reply({ ephemeral: true, content: `${texts.error} https://discord.gg/BKFa6tFYJx` });
                }
                catch (err: any) {
                    Log.error("bot", `Couldn't send error message to user ${interaction.user.username}`);
                }
            }
            Log.error("bot", `Error executing slash command ${cmd.data.name}\n${err.stack}`);
        }
    }
    else if (interaction.isButton()) {
        const [event, ...args] = interaction.customId.trim().split("-");
        switch (event) {
            case "cancel_setup": {
                const [uid] = args;
                let text = {
                    value: "Vale, he cancelado el setup.",
                    not_author: "No eres quien ejecutó el comando originalmente."
                }
                if (Lang !== "es") {
                    text = await utils.autoTranslate(text, "es", Lang);
                }
                if (interaction.isRepliable() && uid !== interaction.user.id) return await interaction.reply({ content: text.not_author, ephemeral: true });
                if (interaction.isRepliable()) await interaction.deferUpdate();
                await interaction.message.edit({ components: [], content: text.value });
                break;
            }
            case "continue_setup": {
                const [uid] = args;
                const foundConfig: any = await db.query("SELECT * FROM filter_configs WHERE guild = ?", [interaction.guildId]);
                let stexts = {
                    errors: {
                        not_author: "No eres quien ejecutó el comando originalmente.",
                        invalid_rsp: "Respuesta inválida."
                    },
                    success: {
                        done: "¡Hemos terminado el setup básico para tu servidor! Abajo está cómo quedó establecida la configuración."
                    },
                    common: {
                        ask_enable: "¿Deseas que al momento de terminar el setup, el filtro se active automáticamente? Responde con un 0 para indiciar que no deseas eso o con un 1 para indicar que sí deseas eso.",
                        loaded_data: "Datos establecidos",
                        yes: "Sí",
                        no: "No",
                        enabled: "Habilitado",
                        init_msg: "Bien. Empezaré con algunas preguntas.",
                        logs_enabled: "Logística habilitada",
                        not_set: "No configurado",
                        set: "Configurado",
                        langtxt: "Idioma",
                        log_channel: "Canal de logística",
                        ask_enabled_logs: "¿Deseas habilitar los registros?",
                        ask_logs_channel: "Activaste los registros, ¿En qué canal los quieres?",
                        ask_lang: "¿Qué idioma quieres para el filtro? Utiliza el código del idioma. Por ejemplo:"
                    }
                };
                const values = {
                    enabled: false,
                    logs_enabled: false,
                    logs_channel: "0",
                    lang: "en"
                }
                if (Lang !== "es") {
                    stexts = await utils.autoTranslate(stexts, "es", Lang);
                }
                if (interaction.isRepliable() && uid !== interaction.user.id) return await interaction.reply({ content: stexts.errors.not_author, ephemeral: true });
                const imessage = interaction.message;
                const embed = new EmbedBuilder()
                    .setTitle(stexts.common.loaded_data)
                    .setDescription(EmbedDescription())
                    .setColor("Purple")
                if (interaction.isRepliable()) await interaction.deferUpdate();
                await imessage.edit({ components: [], embeds: [embed], content: "" });
                // Function to ask for input
                async function GetResponse(msg: string): Promise<Message<boolean>> {
                    const temp_msg = await interaction.channel?.send(msg);
                    const collected = await interaction.channel?.awaitMessages({ filter: m => m.author.id === uid, max: 1 });
                    await temp_msg?.delete();
                    await collected?.first()?.delete();
                    return collected?.first() as Message<boolean>;
                }
                // Function to create embed description
                function EmbedDescription(): string {
                    const enabledValue = values["enabled"] ? stexts.common.yes : stexts.common.no;
                    const enabledLogs = values["logs_enabled"] ? stexts.common.yes : stexts.common.no;
                    const lChannelSet = values["logs_channel"] === "0" ? stexts.common.not_set : `#${interaction.guild?.channels.cache.get(values["logs_channel"])?.name}`;
                    return "```\n" + `${stexts.common.enabled}: ${enabledValue}\n${stexts.common.logs_enabled}: ${enabledLogs}\n${stexts.common.log_channel}: ${lChannelSet}\n${stexts.common.langtxt}: ${values["lang"]}` + "\n```";
                }
                // Ask to enable
                values["enabled"] = await new Promise(async (resolve, reject) => {
                    let err = false;
                    do {
                        const input = await GetResponse(err ? `${stexts.errors.invalid_rsp}\n${stexts.common.ask_enable}` : `${stexts.common.init_msg}\n${stexts.common.ask_enable}`);
                        if (!["0", "1"].some(v => v === input.content)) { err = true; continue; };
                        resolve(Boolean(parseInt(input.content)));
                        break;
                    }
                    while (true);
                });
                embed.setDescription(EmbedDescription());
                await imessage.edit({ embeds: [embed] });
                values["logs_enabled"] = await new Promise(async (resolve, reject) => {
                    let err = false;
                    do {
                        const input = await GetResponse(err ? `${stexts.errors.invalid_rsp}\n${stexts.common.ask_enabled_logs}` : stexts.common.ask_enabled_logs);
                        if (!["0", "1"].some(v => v === input.content)) { err = true; continue; };
                        resolve(Boolean(parseInt(input.content)));
                        break;
                    }
                    while (true);
                });
                embed.setDescription(EmbedDescription());
                await imessage.edit({ embeds: [embed] });
                if (values["logs_enabled"]) {
                    values["logs_channel"] = await new Promise(async (resolve, reject) => {
                        let err = false;
                        do {
                            const input = await GetResponse(err ? `${stexts.errors.invalid_rsp}\n${stexts.common.ask_logs_channel}` : stexts.common.ask_logs_channel);
                            if (!input.mentions.channels.first() || (input.mentions.channels.first() && !input.mentions.channels.first()?.isTextBased())) { err = true; continue; };
                            resolve((input.mentions.channels.first() as unknown as TextChannel).id);
                            break;
                        }
                        while (true);
                    });
                    embed.setDescription(EmbedDescription());
                    await imessage.edit({ embeds: [embed] });
                }
                values["lang"] = await new Promise(async (resolve, reject) => {
                    let err = false;
                    do {
                        const input = await GetResponse(err ? `${stexts.errors.invalid_rsp}\n${stexts.common.ask_lang} Español -> es || English -> en` : `${stexts.common.ask_lang} Español -> es || English -> en`);
                        if (input.content.length > 2 || ["br", "ch", "wa"].some(v => input.content.toLowerCase() === v) || !langs.has(1, input.content.toLowerCase())) { err = true; continue; };
                        resolve(input.content.toLowerCase());
                        break;
                    }
                    while (true);
                });
                if (!Boolean(parseInt(args[1]))) await db.query("INSERT INTO filter_configs SET ?", [{
                    enabled: values["enabled"],
                    guild: interaction.guildId,
                    log_channel: values["logs_channel"],
                    enabled_logs: values["logs_enabled"],
                    lang: values["lang"]
                }]);
                else await db.query("UPDATE filter_configs SET ? WHERE guild = ?", [{
                    enabled: values["enabled"],
                    guild: interaction.guildId,
                    log_channel: values["logs_channel"],
                    enabled_logs: values["logs_enabled"],
                    lang: values["lang"]
                }, interaction.guildId]);
                embed.setDescription(EmbedDescription());
                await imessage.edit({ embeds: [embed], content: stexts.success.done });
            }
        }
        return;
    }
});

client.on("messageCreate", async (message): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(message.author.id)) return;
    if (!message.inGuild()) return;
    if (Number(process.env.INGORE_GLOBAL_CHAT) === 1) return;
    const chatdb: any = await db.query("SELECT * FROM globalchats WHERE guild = ?", [message.guildId]);
    if (!chatdb[0]) return;
    if (message.channelId !== chatdb[0].channel) return;
    const { author, channel, guild, content } = message;
    if (author.bot) return;
    await manager.processUser(author);
    await manager.processMessage(message);
});

client.on("messageCreate", async (message): Promise<any> => {
    if (!message.inGuild()) return;
    let filterConfig: any = await db.query("SELECT * FROM filter_configs WHERE guild = ?", [message.guildId]);
    if (!filterConfig[0]) return;
    filterConfig = filterConfig[0];
    if (!Boolean(filterConfig.enabled)) return;
    const wordList: any = await db.query("SELECT * FROM filter_words");
    if (!wordList.some((w: any) => message.content.toLowerCase().includes(w.content))) return;
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;
    const webHookData: any = await db.query("SELECT * FROM filter_webhooks WHERE channel = ?", [message.channel.id]);
    const webhook = webHookData[0] ? new WebhookClient({ id: webHookData[0].id, token: webHookData[0].token }) : await (message.channel as TextChannel).createWebhook({ name: "Filter WebHook", avatar: client.user?.displayAvatarURL() });
    if (!webHookData[0]) {
        await db.query("INSERT INTO filter_webhooks SET ?", [{ id: webhook.id, token: webhook.token, channel: message.channel.id }]);
    }
    if (wordList.length < 1) return;
    const badWords = wordList.filter((w: any) => message.content.toLowerCase().includes(w.content));
    let content = message.content;
    if (badWords.length > 0) for (const word of badWords) { const reg = new RegExp(word.content, "ig"); content = content.replace(reg, `\`${utils.createCensored(word.content.length)}\``).replace(new RegExp(/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi), "[LINK]"); continue }
    const { author } = message;
    await message.delete();
    let reference: any;
    if (message.reference) reference = await message.fetchReference();
    const msg = await webhook.send({
        content: message.reference ? `> ${reference.content}\n<@${reference.author.id}> ${content}` : content,
        avatarURL: author.displayAvatarURL(),
        allowedMentions: { parse: [] },
        username: message.member?.nickname ?? author.displayName,
        files: message.attachments.map(a => a),
    });
    if (filterConfig.enabled_logs) {
        const channel = message.guild.channels.cache.get(filterConfig.log_channel) as TextChannel;
        if (!channel) return;
        let canSend = false;
        try {
            const tmpmsg = await channel.send(".");
            canSend = true;
            await tmpmsg.delete();
        }
        catch (e: any) {
            Log.warn("bot", `Can't send filter log to set channel in guild ${message.guild.name}`);
        }
        if (canSend) {
            let texts = {
                title: "Filtered message",
                description: "A message from author r3tr0 has been filtered on xdss",
                original_content: "Original content",
                filtered: "Filtered words"
            };
            if (filterConfig.lang !== "en") {
                texts = await utils.autoTranslate(texts, "en", filterConfig.lang);
            }
            const embed = new EmbedBuilder()
                .setTitle(texts.title)
                .setDescription(texts.description.replace(new RegExp("r3tr0", "ig"), `<@${message.author.id}>`).replace(new RegExp("xdss", "ig"), `<#${filterConfig.log_channel}>`))
                .addFields(
                    {
                        name: texts.original_content,
                        value: message.content
                    },
                    {
                        name: texts.filtered,
                        value: badWords.map((w: any) => w.content).join(", ")
                    }
                )
                .setColor("Purple");
            await channel.send({ embeds: [embed] });
        }
    }
});

manager.on("limit-reached", async u => {
    const user = await client.users.fetch(u.uid);
    Log.info("bot", `User ${user?.username} has reached messages limit. This user's gonna be ratelimited if he sends another message before time resets.`, true);
    await manager.announce(`User ${user?.username} has reached messages limit. This user's gonna be ratelimited if he sends another message before time resets. Time remaining: ${u.time_left / 1000} seconds.`, "en");
});
manager.on("limit-exceed", async u => {
    const user = await client.users.fetch(u.uid);
    manager.ratelimit(u.uid, user?.username);
    Log.info("bot", `User ${user?.username} has been ratelimited for ${manager.options.ratelimit_time / 1000} seconds.`, true);
});

client.login(data.bot.token);

export default client;