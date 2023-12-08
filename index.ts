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
import { EmbedBuilder, ActionRow, GatewayIntentBits, Client, ActivityType, Partials, PermissionFlagsBits, MessagePayload, WebhookClient, TextChannel, Message, time, TimestampStyles } from "discord.js";
import * as fs from "fs";
import data from "./data";
import Log from "./Log";
import queries from "./mysql/queries";
import db from "./mysql/database";
import utils from "./utils";
import load_slash from "./load_slash";
import ChatManager from "./managers/ChatManager";
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
});

client.on("messageCreate", async (message): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(message.author.id)) return;
    if (message.author.bot) return;
    let prefix = "b.";
    const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [message.author.id]) as unknown) as any[]);
    const Lang = foundLang[0] ? foundLang[0].lang : "en";
    if (message.content.toLowerCase().startsWith("b.")) {
        if (Lang === "es") {
            message.reply("Lo siento, los comandos de prefijo ya no son soportados.");
        }
        else {
            const reply = (await utils.translate("Lo siento, los comandos de prefijo ya no son soportados.", "es", Lang)).text;
            message.reply(reply);
        }
    }
});
client.on("interactionCreate", async (interaction): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(interaction.user.id)) return;
    const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [interaction.user.id]) as unknown) as any[]);
    const Lang = foundLang[0] ? foundLang[0].lang : "en";
    let texts = {
        new: "Hey! Veo que es la primera vez que utilizas uno de mis comandos, por lo menos en esta cuenta jaja. Quiero decirte que no te olvides de leer mi política de privacidad!",
        error: "Whoops... Ha ocurrido un error inesperado, ya he reportado el error pero si éste persiste, puedes notificarlo en el siguiente enlace:"
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
            await interaction.deferReply({ ephemeral: cmd.ephemeral as boolean });
            await cmd.execute(interaction, Lang);
            await db.query("UPDATE executed_commands SET is_last = FALSE WHERE is_last = TRUE");
            await db.query("INSERT INTO executed_commands SET ?", [{ command: interaction.commandName, uid: interaction.user.id, at: Math.round(Date.now() / 1000) }]);
            const foundU: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [interaction.user.id]);
            if (foundU[0]) {
                await db.query("UPDATE discord_users SET command_executions = command_executions + 1, pfp = ?, username = ? WHERE id = ?", [interaction.user.displayAvatarURL({ size: 1024 }), interaction.user.username, interaction.user.id]);
            }
            else {
                await db.query("INSERT INTO discord_users SET ?", { id: interaction.user.id, pfp: interaction.user.displayAvatarURL({ size: 1024 }), username: interaction.user.username });
                await interaction.channel?.send(`<@${interaction.user.id}>, ${texts.new}: [privacy.txt](https://github.com/Barnie-Corps/barniebot/blob/master/privacy.txt)`);
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
});

client.on("messageCreate", async (message): Promise<any> => {
    if (Number(process.env.TEST) === 1 && !data.bot.owners.includes(message.author.id)) return;
    if (!message.inGuild()) return;
    const chatdb: any = await db.query("SELECT * FROM globalchats WHERE guild = ?", [message.guildId]);
    if (!chatdb[0]) return;
    if (message.channelId !== chatdb[0].channel) return;
    const { author, channel, guild, content } = message;
    if (author.bot) return;
    await manager.processUser(author);
    await manager.processMessage(message);
});

manager.on("limit-reached", async u => {
    const user = await client.users.fetch(u.uid);
    Log.info("bot", `User ${user?.username} has reached messages limit. This user's gonna be ratelimited if he sends another message before time resets.`);
    await manager.announce(`User ${user?.username} has reached messages limit. This user's gonna be ratelimited if he sends another message before time resets.`, "en");
});
manager.on("limit-exceed", async u => {
    const user = await client.users.fetch(u.uid);
    manager.ratelimit(u.uid, user?.username);
    Log.info("bot", `User ${user?.username} has been ratelimited for ${manager.options.ratelimit_time / 1000} seconds`);
});

client.login(data.bot.token);

export default client;