/**
 * Open source discord bot created by r3tr00_ (owner of Barnie Corps)
 * Please read the license at LICENSE in the root of the project.
 * It is highly recommended that you read the license before using this bot's code but if you do not, you can do so at https://opensource.org/licenses/MIT.
 * Here's a summary of the license:
 * The MIT License (MIT)
 * Copyright (c) 2025 Barnie Corps
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 * Also it's important to know that even though you can use this bot's code for your own purposes, you cannot claim it as your own and must give credit to the original creator.
 * See based.txt to get comments to put in your discord bot based on BarnieBot, you should put 'em but it's not completely necessary.
 * Certificate of registration: https://www.copyrighted.com/work/23e3X3GmrHeYiS1d
 */
global.ReadableStream = require('web-streams-polyfill').ReadableStream;
global.Headers = require("node-fetch").Headers;
globalThis.fetch = require("node-fetch");
import * as dotenv from "dotenv";
dotenv.config();
import { EmbedBuilder, GatewayIntentBits, Client, ActivityType, Partials, PermissionFlagsBits, WebhookClient, TextChannel, Message, time, TimestampStyles, Collection, MessageFlags } from "discord.js";
import * as fs from "fs";
import data from "./data"; // Data file for storing bot data
import Log from "./Log"; // Log object for logging
import queries from "./mysql/queries"; // This file is used to create the tables if they don't exist
import db from "./mysql/database"; // Database connection
import utils from "./utils"; // Utils file for utility functions
import load_slash from "./load_slash"; // Load slash commands
import ChatManager from "./managers/ChatManager"; // Chat manager for global chat
import Workers from "./Workers"; // Workers for background tasks
import path from "path";
import { inspect } from "util"; // Used for eval command
import langs from "langs"; // Used for language codes
const manager = new ChatManager();
// Catch unhandled errors
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
// Load commands
(async function () {
    // Get command file names
    const commandsDir = fs.readdirSync("./commands").filter(f => f.endsWith(".ts"));
    // Iterate over each command file and load it
    for (const cmdFile of commandsDir) {
        try {
            const command = (await import(`./commands/${cmdFile.trim().split(".")[0]}`)).default;
            data.bot.commands.set(command.data.name, command);
        }
        // Catch any errors that may occur while loading the command file
        catch (err: any) {
            Log.error("Command loading failed", new Error(`Failed to load command file '${cmdFile}': ${err.stack}`));
        }
    }
    // Log the amount of commands loaded
    Log.success(`Commands loaded successfully`, { 
        component: "CommandLoader",
        loadedCommands: data.bot.commands.size,
        totalCommands: commandsDir.length
    });
})();

client.on("clientReady", async (): Promise<any> => {
    Log.success(`Bot logged in successfully`, { 
        component: "Bot",
        username: client.user?.tag
    });
    queries();
    client.user?.setPresence({ activities: [{ name: `V ${String(process.env.VERSION)}`, type: ActivityType.Playing }] });
    await load_slash(); // Load slash commands
    Log.info(`Cache status`, { 
        component: "Bot",
        usersCacheSize: client.users.cache.size
    });
    data.bot.owners.push(...String(process.env.OWNERS).trim().split(",")); // Load owners from .env
    Log.info("Owners data loaded", { component: "Initialization" });
    Log.info("Loading workers...", { component: "Initialization" });
    // Check if the bot was safely shutted down or not
    if (Number(process.env.SAFELY_SHUTTED_DOWN) === 0 && Number(process.env.NOTIFY_STARTUP) === 1) {
        await manager.announce("Hey! I have been restarted. According to my records it was a forced restart, so I could not warn you in advance. We apologize for any inconvenience or downtime this may have caused.", "en");
    }
    else if (Number(process.env.NOTIFY_STARTUP) === 1) await manager.announce("I'm back! The global chat is online again.", "en");
    Workers.bulkCreateWorkers(path.join(__dirname, "workers", "translate.js"), "translate", 5); // Create 5 workers for translation tasks
    fs.writeFileSync("./.env", fs.readFileSync('./.env').toString().replace("SAFELY_SHUTTED_DOWN=1", "SAFELY_SHUTTED_DOWN=0"));
    Log.info("Workers loaded", { component: "WorkerSystem" });
    Log.info("Bot is ready", { component: "System" });
});

const activeGuilds: Collection<string, number> = new Collection(); // Active guilds collection for active guilds tracking (messageCreate event)

client.on("messageCreate", async (message): Promise<any> => {
    // Check if the bot is in test mode and if the user is not an owner
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(message.author.id)) return;
    if (message.author.bot) return;
    if (!message.inGuild()) return;
    // Check if user message counter is not in the database
    const foundCount: any = await db.query("SELECT * FROM message_count WHERE uid = ?", [message.author.id]);
    if (!foundCount[0]) {
        // If it is not in the database, add it
        await db.query("INSERT INTO message_count SET ?", [{ uid: message.author.id }]);
    }
    else {
        // If it is in the database, increment the message count
        await db.query("UPDATE message_count SET count = ? WHERE uid = ?", [(foundCount[0].count as number) + 1, message.author.id]);
    }
    // Check if the guild is already in the activeGuilds collection
    if (activeGuilds.has(message.guildId as string)) {
        const agValue = activeGuilds.get(message.guildId as string);
        activeGuilds.set(message.guildId as string, (agValue as number) + 1);
    }
    else {
        // If the guild is not in the activeGuilds collection, add it
        activeGuilds.set(message.guildId as string, 1);
    }
    const prefix = "b.";
    const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [message.author.id]) as unknown) as any[]); // Get user language
    const Lang = foundLang[0] ? foundLang[0].lang : "en"; // If the user has a language set, use it, otherwise use English
    // Check if the message starts with the prefix and if the user is not an owner
    if (message.content.toLowerCase().startsWith(prefix) && !data.bot.owners.includes(message.author.id)) return;
    if (!message.content.toLowerCase().startsWith(prefix)) return;
    // Split the message content and get the command and arguments
    const [command, ...args] = message.content.slice(prefix.length).trim().split(" ");
    switch (command) {
        case "shutdown": {
            await manager.announce("Hey! I'm shutting down in just a second. Sorry for the inconvenience.", "en");
            fs.writeFileSync("./.env", fs.readFileSync('./.env').toString().replace("SAFELY_SHUTTED_DOWN=0", "SAFELY_SHUTTED_DOWN=1"));
            client.destroy();
            process.exit(0);
        } // Shutdown the bot
        case "announce": {
            const [language, ...msg] = args;
            await manager.announce(msg.join(" "), language, message.attachments);
            break;
        } // Announce a message to all users through the global chat
        case "messages": {
            const [id] = args;
            const msg: any = await db.query("SELECT * FROM global_messages WHERE uid = ?", [id]);
            if (!msg[0]) return await message.reply("Not found.");
            const user = await client.users.fetch(msg[0].uid);
            fs.writeFileSync(`./messages_report_${user.id}.txt`, `Messages report for user ${user.username} (${user.id}) - ${msg.length} messages\n\n${msg.map((m: any) => `[${m.id}] ${user.username}: ${utils.decryptWithAES(data.bot.encryption_key, m.content)}`).join(`\n`)}`);
            await message.reply({ files: [`./messages_report_${user.id}.txt`] });
            fs.unlinkSync(`./messages_report_${user.id}.txt`);
            break;
        } // Get global chat messages report for a user by ID
        case "invite": {
            const [sid] = args;
            const server = client.guilds.cache.get(sid);
            if (!server) return message.reply("Not found.");
            const channel = server.channels.cache.find(c => c.isTextBased());
            await message.reply({ content: (await channel?.guild.invites.create(channel as TextChannel, { maxAge: 0, maxUses: 0 }) as any).url });
            break;
        } // Get an invite for a server (first text channel found)
        case "guilds": {
            fs.writeFileSync("./guilds.txt", client.guilds.cache.map(g => `${g.name} | ${g.memberCount} | ${g.id}`).join("\n"));
            await message.reply({ files: ["./guilds.txt"] });
            fs.unlinkSync('./guilds.txt');
            break;
        } // Get a list of guilds the bot is in (name, member count, id)
        case "eval": {
            // Check if the user is an owner
            if (!data.bot.owners.includes(message.author.id)) return message.reply('no');
            const targetCode = args.slice(0).join(' '); // Get the code to eval from the message content
            if (!targetCode) return message.reply('You must provide a code to eval.');
            try {
                // Evaluate the code
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
                    ) // Create an embed with the evaluation results
                message.reply({ embeds: [embed] }); // Reply with the embed
                break;
            }
            // Catch any errors that may occur while evaluating the code and reply with the error
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
            break;
        }
        case "active_guilds": {
            const guilds = [...(function () {
                let guilds = [];
                for (const guildId of activeGuilds.keys()) {
                    guilds.push({ id: guildId, value: activeGuilds.get(guildId), name: client.guilds.cache.get(guildId)?.name });
                }
                return guilds;
            })()]; // Get active guilds and their message count (value)
            const sliced = guilds.slice(0, 19); // Slice the array to get the first 20 guilds
            if (sliced.length < 1) return await message.reply("No active guilds.");
            await message.reply("```\n" + `${guilds.length} Guilds. Showing ${sliced.length} (Max 20)\n\n${sliced.map(g => `${g.name} (${g.id}) -> ${g.value}`).join("\n")}` + "\n```"); // Reply with the active guilds
            break;
        } // Get active guilds
        case "add_vip": {
            if (!args[0]) return await message.reply("You must provide the user ID.");
            // Get the arguments from the message content
            const [uid, newTime, timeType] = args;
            // Check if the arguments are missing and reply with a message if they are missing
            if ([uid, newTime, timeType].some(v => !v)) return await message.reply("Missing arguments. Required arguments: ID TIME TIME_TYPE");
            const multiply = {
                seconds: 1,
                minutes: 60,
                hours: 3600,
                days: 86400,
            } // Time types and their multipliers
            if (isNaN(parseInt(uid))) return await message.reply("Invalid ID.");
            let validUser = false;
            try {
                // Check if the user exists and if it does, set validUser to true
                await client.users.fetch(uid);
                validUser = true;
            }
            catch (error) {
                // If the user does not exist, reply with a message and break the switch statement
                await message.reply("Invalid ID.");
                break;
            }
            if (isNaN(parseInt(newTime))) return await message.reply("Invalid time provided."); // Check if the time is a number and if it is not, reply with a message and break the switch statement
            if (!Object.keys(multiply).some(m => m === timeType.toLowerCase())) return await message.reply(`Invalid time type provided. Supported types: \`${Object.keys(multiply).join(", ")}.\``); // Check if the time type is valid and if it is not, reply with a message and break the switch statement
            const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [uid]); // Check if the user is already VIP
            const totalTime = (1000 * multiply[timeType as keyof typeof multiply]) * parseInt(newTime); // Calculate the total time in milliseconds
            const now = Date.now();
            const end = now + totalTime;
            if (foundVip[0]) {
                // If the user is already VIP, update the VIP time
                await db.query("UPDATE vip_users SET end_date = ? WHERE id = ?", [end, uid]);
                await message.reply(`VIP time has been updated to ${newTime} ${timeType} for user with ID ${uid}. ${time(Math.round(foundVip[0].end_date / 1000), TimestampStyles.ShortDate)} -> ${time(Math.round(end / 1000), TimestampStyles.ShortDate)} (Ends in ${time(Math.round(end / 1000), TimestampStyles.RelativeTime)})`);
                break;
            }
            else {
                // If the user is not VIP, add VIP to the user
                await db.query("INSERT INTO vip_users SET ?", [{
                    id: uid,
                    start_date: now,
                    end_date: end,
                }]);
                await message.reply(`VIP has been added to user with ID ${uid} for ${newTime} ${timeType} -> ${time(Math.round(end / 1000), TimestampStyles.ShortDate)} (${time(Math.round(end / 1000), TimestampStyles.RelativeTime)})`);
                break;
            }
        }
        case "remove_vip": {
            if (!args[0]) return await message.reply("You must provide the user ID.");
            const [uid] = args;
            if (!uid) return await message.reply("Missing arguments. Required arguments: ID");
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
            const user = await client.users.fetch(uid);
            const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [uid]);
            if (!foundVip[0]) return await message.reply("User is not VIP.");
            await db.query("DELETE FROM vip_users WHERE id = ?", [uid]);
            await message.reply(`VIP has been removed from user with ID ${uid} [@${user.username} / ${user.displayName}].`);
            break;
        }
        case "fetch_guilds_members": {
            const msg = await message.reply("<a:discordproloading:875107406462472212> Fetching members from guilds...");
            for (const g of client.guilds.cache.values()) {
                await g.members.fetch();
            }
            await msg.edit("Finished fetching members from guilds.");
            break;
        }
    }
});

client.on("messageCreate", async (message): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(message.author.id)) return;
    if (message.author.bot) return;
    const customResponses: any = await db.query("SELECT * FROM custom_responses WHERE guild = ?", [message.guildId]);
    if (!customResponses[0]) return;
    for (const cr of customResponses) {
        let match = false;
        if (cr.is_regex) {
            try {
                match = new RegExp(cr.command, "i").test(message.content);
            } catch (error) {
                console.error("Error parsing regex:", error);
            }
        } else {
            match = message.content.toLowerCase() === cr.command.toLowerCase();
        }
        if (match) {
            await message.reply(cr.response);
            break;
        }
    }
});

client.on("interactionCreate", async (interaction): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(interaction.user.id)) return;
    const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [interaction.user.id]) as unknown) as any[]);
    const Lang = foundLang[0] ? foundLang[0].lang : "en"; // If the user has a language set, use it, otherwise use English
    let texts = {
        new: "Hey! It looks like this is the first time you're using one of my commands, at least on this account. Don't forget to read my privacy policy!",
        error: "Whoops... An unexpected error occurred. I've already reported it, but if it keeps happening you can let us know at:",
        loading: "Translating texts (this may take a moment)...",
        not_vip: "Hmm... You can't run this command unless you're a VIP.",
        expired_vip: "Wow! It seems your VIP subscription has ended. I've revoked your VIP access."
    } // Texts for the interactionCreate event
    if (Lang !== "en") {
        texts = await utils.autoTranslate(texts, "en", Lang); // Translate the texts to the user's language if it is not English
    }
    if (interaction.isCommand()) {
        const cmd = data.bot.commands.get(interaction.commandName as string);
        if (!cmd) {
            // If the command is not found, reply with an error message
            return await interaction.reply({ content: "```\n" + `/${interaction.commandName}\n ${utils.createArrows(`${interaction.command?.name}`.length)}\n\nERR: Unknown slash command` + "\n```", ephemeral: true });
        }
        try {
            await interaction.reply({ content: Lang !== "en" ? `${texts.loading} <a:discordproloading:875107406462472212>` : `<a:discordproloading:875107406462472212>`, flags: cmd.ephemeral ?  MessageFlags.Ephemeral : undefined }); // Reply with a loading message
            await cmd.execute(interaction, Lang);
            await db.query("UPDATE executed_commands SET is_last = FALSE WHERE is_last = TRUE"); // Update the last command executed
            await db.query("INSERT INTO executed_commands SET ?", [{ command: interaction.commandName, uid: interaction.user.id, at: Math.round(Date.now() / 1000) }]); // Insert the executed command into the executed_commands table
            const foundU: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [interaction.user.id]); // Check if the user exists in the database
            const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [interaction.user.id]); // Check if the user is VIP
            if (foundVip[0] && foundVip[0].end_date <= Date.now()) {
                await db.query("DELETE FROM vip_users WHERE id = ?", [interaction.user.id]);
                await interaction.followUp({ content: texts.expired_vip, ephemeral: true });
            } // If the user is VIP and the VIP time has expired, remove the VIP from the user
            if (foundU[0]) {
                await db.query("UPDATE discord_users SET command_executions = command_executions + 1, pfp = ?, username = ? WHERE id = ?", [interaction.user.displayAvatarURL({ size: 1024 }), interaction.user.username, interaction.user.id]);
            } // If the user exists in the database, update the user's data
            else {
                // If the user does not exist in the database, insert the user into the database
                await db.query("INSERT INTO discord_users SET ?", { id: interaction.user.id, pfp: interaction.user.displayAvatarURL({ size: 1024 }), username: interaction.user.username });
                const msg = await interaction.followUp({ content: `<@${interaction.user.id}>, ${texts.new}: [privacy.txt](https://github.com/Barnie-Corps/barniebot/blob/master/privacy.txt)`, ephemeral: true });
                await msg.removeAttachments();
            }
        }
        catch (err: any) {
            // If an error occurs while executing the command, reply with an error message
            if (interaction.deferred || interaction.replied) {
                try {
                    await interaction.editReply(`${texts.error} https://discord.gg/BKFa6tFYJx`);
                }
                catch (err: any) {
                    Log.error("Error sending message to user", new Error(`Failed to send error message to ${interaction.user.username}`));
                    await (interaction.channel as TextChannel).send(`<@${interaction.user.id}>, ${texts.error} https://discord.gg/BKFa6tFYJx`);
                }
            }
            else {
                try {
                    await interaction.reply({ ephemeral: true, content: `${texts.error} https://discord.gg/BKFa6tFYJx` });
                }
                catch (err: any) {
                    Log.error("Error sending message to user", new Error(`Failed to send error message to ${interaction.user.username}`));
                }
            }
            Log.error("Slash command execution failed", new Error(`Error executing command ${cmd.data.name}`));
            console.error(err.stack, err);
        }
    }
    else if (interaction.isButton()) {
        // If the interaction is a button interaction, split the customId and get the event and arguments
        const [event, ...args] = interaction.customId.trim().split("-");
        switch (event) {
            case "cancel_setup": {
                // If the event is cancel_setup, cancel the setup
                const [uid] = args;
                let text = {
                    value: "Alright, I've cancelled the setup.",
                    not_author: "You're not the person who ran the command originally."
                } // Texts for the cancel_setup event
                if (Lang !== "en") {
                    text = await utils.autoTranslate(text, "en", Lang); // Translate the texts to the user's language if it is not English
                }
                if (interaction.isRepliable() && uid !== interaction.user.id) return await interaction.reply({ content: text.not_author, ephemeral: true }); // Check if the user is the author of the original command and if not, reply with a message
                if (interaction.isRepliable()) await interaction.deferUpdate(); // Defer the interaction if it is repliable
                await interaction.message.edit({ components: [], content: text.value }); // Edit the message to remove the components and reply with a message
                break;
            }
            case "continue_setup": {
                const [uid] = args;
                const foundConfig: any = await db.query("SELECT * FROM filter_configs WHERE guild = ?", [interaction.guildId]);
                let stexts = {
                    errors: {
                        not_author: "You're not the person who ran the command originally.",
                        invalid_rsp: "Invalid response."
                    },
                    success: {
                        done: "We've finished the basic setup for your server! Below is the configuration we applied."
                    },
                    common: {
                        ask_enable: "Do you want the filter to enable automatically when the setup ends? Reply with 0 if you don't and 1 if you do.",
                        loaded_data: "Configured data",
                        yes: "Yes",
                        no: "No",
                        enabled: "Enabled",
                        init_msg: "Great. I'll start with a few questions.",
                        logs_enabled: "Logging enabled",
                        not_set: "Not configured",
                        set: "Configured",
                        langtxt: "Language",
                        log_channel: "Log channel",
                        ask_enabled_logs: "Do you want to enable logging?",
                        ask_logs_channel: "You enabled logging. Which channel should I use?",
                        ask_lang: "Which language should the filter use? Provide the language code. For example:"
                    }
                };
                const values = {
                    enabled: false,
                    logs_enabled: false,
                    logs_channel: "0",
                    lang: "en"
                }
                if (Lang !== "en") {
                    stexts = await utils.autoTranslate(stexts, "en", Lang);
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
                    const temp_msg = await (interaction.channel as TextChannel).send(msg);
                    const collected = await (interaction.channel as TextChannel).awaitMessages({ filter: m => m.author.id === uid, max: 1 });
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
                        const input = await GetResponse(err ? `${stexts.errors.invalid_rsp}\n${stexts.common.ask_lang} English -> en || Spanish -> es` : `${stexts.common.ask_lang} English -> en || Spanish -> es`);
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

client.on("guildCreate", async (guild): Promise<any> => {
    const owner = await client.users.fetch(guild.ownerId);
    const embed = new EmbedBuilder()
        .setTitle("New guild")
        .setDescription(`Joined a new guild: ${guild.name} (${guild.id})`)
        .setColor("Purple")
        .setFooter({ text: `Owner: ${owner.username} (${owner.id})`, iconURL: owner.displayAvatarURL({ size: 1024 }) })
    const channel = client.channels.cache.get(data.bot.log_channel) as TextChannel;
    if (!channel) return;
    await channel.send({ embeds: [embed] });
    Log.info("Guild joined", { 
        component: "GuildSystem",
        guildName: guild.name,
        guildId: guild.id
    });
});

client.on("guildDelete", async (guild): Promise<any> => {
    const owner = await client.users.fetch(guild.ownerId);
    const embed = new EmbedBuilder()
        .setTitle("Left guild")
        .setDescription(`Left a guild: ${guild.name} (${guild.id})`)
        .setColor("Red")
        .setFooter({ text: `Owner: ${owner.username} (${owner.id})`, iconURL: owner.displayAvatarURL({ size: 1024 }) })
    const channel = client.channels.cache.get(data.bot.log_channel) as TextChannel;
    if (!channel) return;
    await channel.send({ embeds: [embed] });
    Log.info("Guild left", { 
        component: "GuildSystem",
        guildName: guild.name,
        guildId: guild.id
    });
    db.query("DELETE FROM filter_configs WHERE guild = ?", [guild.id]);
    db.query("DELETE FROM filter_words WHERE guild = ?", [guild.id]);
    Log.info("Filter configs deleted", { 
        component: "FilterSystem",
        guildName: guild.name,
        guildId: guild.id
    });
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
    if (message.author.bot) return;
    if (!message.channel.isTextBased()) return;
    let filterConfig: any = await db.query("SELECT * FROM filter_configs WHERE guild = ?", [message.guildId]);
    if (!filterConfig[0]) return;
    filterConfig = filterConfig[0];
    if (!Boolean(filterConfig.enabled)) return;
    const wordList: any = await db.query("SELECT * FROM filter_words WHERE guild = ?", [message.guildId]);
    if (!wordList.some((w: any) => message.content.toLowerCase().includes(w.content))) return;
    if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;
    const webHookData: any = await db.query("SELECT * FROM filter_webhooks WHERE channel = ?", [message.channel.id]);
    let webhook: any;
    if (webHookData[0]) {
        webhook = (await (message.channel as TextChannel).fetchWebhooks()).find((h: any) => h.id === webHookData[0].id);
    }
    else {
        webhook = await (message.channel as TextChannel).createWebhook({ name: "Filter Webhook", reason: "Filter webhook" });
        await db.query("INSERT INTO filter_webhooks SET ?", [{ id: webhook.id, token: webhook.token, channel: message.channel.id }]);
    }
    if (wordList.length < 1) { console.log("No words found."); return; }
    const badWords = wordList.filter((w: any) => message.content.toLowerCase().includes(w.content)).sort((w1: any, w2: any) => {
        if (w1.content.length > w2.content.length) return -1;
        else if (w2.content.length > w1.content.length) return 1;
        else return 0;
    });
    let content = message.content;
    if (badWords.length > 0) for (const word of badWords) {
        if (word.single) {
            content = content.trim().split(" ").map((w: string) => {
                if (new RegExp(`\\b${word.content}\\b`, "ig").test(w)) return `\`${utils.createCensored(word.content.length)}\``;
                return w;
            }).join(" ");
            continue;
        }
        const reg = new RegExp(word.content, "ig");
        content = content.replace(reg, `\`${utils.createCensored(word.content.length)}\``).replace(new RegExp(/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi), "[LINK]");
        continue;
    }
    if (content === message.content) return;
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
            Log.warn("Filter log send failed", { 
                component: "FilterSystem",
                guildName: message.guild.name
            });
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
                .setDescription(texts.description.replace(new RegExp("r3tr0", "ig"), `<@${message.author.id}>`).replace(new RegExp("xdss", "ig"), `<#${message.channel.id}>`))
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
    Log.info("User approaching rate limit", { 
        component: "RateLimit",
        username: user?.username,
        status: "warning"
    });
    await manager.announce(`User ${user?.username} has reached messages limit. This user's gonna be ratelimited if he sends another message before time resets. Time remaining: ${u.time_left / 1000} seconds.`, "en");
});
manager.on("limit-exceed", async u => {
    const user = await client.users.fetch(u.uid);
    manager.ratelimit(u.uid, user?.username);
    Log.info("User rate limited", { 
        component: "RateLimit",
        username: user?.username,
        duration: manager.options.ratelimit_time / 1000
    });
});

client.login(data.bot.token);

export default client;