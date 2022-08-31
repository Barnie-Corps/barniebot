/**
 * Open source discord bot created by Santiago.#9521 (owner of Barnie Corps)
 * Please read the license at LICENSE in the root of the project.
 * It is highly recommended that you read the license before using this bot's code but if you do not, you can do so at https://opensource.org/licenses/MIT.
 * Here's a summary of the license:
 * The MIT License (MIT)
 * Copyright (c) 2022 Barnie Corps
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 * Also it's important to know that even though you can use this bot's code for your own purposes, you cannot claim it as your own and must give credit to the original creator.
 */
import * as dotenv from "dotenv";
dotenv.config();
import { EmbedBuilder, ActionRow, GatewayIntentBits, Client } from "discord.js";
import * as fs from "fs";
import data from "./data";
import Log from "./Log";
import queries from "./mysql/queries";
import db from "./mysql/database";
import utils from "./utils";
const client = new Client({
    intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMessageTyping, GatewayIntentBits.GuildEmojisAndStickers],
    ws: {
        properties: {
            browser: "Discord Android"
        }
    }
});
(async function() {
    const commandsDir = fs.readdirSync("./commands").filter(f => f.endsWith(".ts"));
    for (const cmdFile of commandsDir) {
        try {
            const command = (await import(`./commands/${cmdFile.trim().split(".")[0]}`)).default;
            const requiredProperties: string[] = ["data", "execute"];
            const missingProperties: string[] = requiredProperties.filter(p => !Object.keys(command).includes(p));
            if (missingProperties.length > 0) {
                Log.warn("commands", `The command file '${cmdFile}' has the following required properties missing: ${missingProperties.map(p => p).join(", ")}. To avoid any error, it hasn't been loaded.`);
                continue;
            }
            const requiredDataProperties: string[] = ["name", "aliases", "requiredGuildPermissions", "guildOnly"];
            const missingDataProperties: string[] = requiredDataProperties.filter(p => !Object.keys(command.data).includes(p));
            if (missingDataProperties.length > 0) {
                Log.warn("commands", `The command file '${cmdFile}' has the following required data properties missing: ${missingDataProperties.map(p => p).join(", ")}. To avoid any error, it hasn't been loaded.`);
                continue;
            }
            data.bot.commands.set(command.data.name, command);
        }
        catch (err: any) {
            Log.error("commands", `Couldn't load command file '${cmdFile}' properly due to an unexpected error:\n${err}`);
        }
    }
    Log.success("commands", `Successfully loaded ${data.bot.commands.size}/${commandsDir.length} commands.`);
})();

client.on("ready", async (): Promise<any> => {
    Log.success("bot", `Successfully logged in at discord as ${client.user?.tag}`);
    queries();
});

client.on("messageCreate", async (message): Promise<any> => {
    let prefix = "b.";
    if (message.guild) {
        const DBPrefix = ((await db.query("SELECT * FROM prefixes WHERE guild = ?", [message.guild.id]) as unknown) as any[]);
        if (DBPrefix[0]) {
            prefix = DBPrefix[0].prefix;
        }
    }
    const args = message.content.slice(prefix.length).trim().split(" ");
    const command = message.content.toLowerCase().startsWith(prefix.toLowerCase()) ? args.shift() : "none";
    async function reply(content: string) {
        return message.reply(content).catch((err:  any) => {
            Log.error("bot", `Couldn't reply to ${message.author.tag} due to an unexpected error: ${err}`);
        });
    }
    if (command === "none") return;
    else {
        const foundCommand = data.bot.commands.get(command as string) ?? data.bot.commands.find(c => c.data.aliases.includes(command));
        if (!foundCommand) return reply("```\n" + `${prefix}${command} ${args.slice(0).join(" ")}\n${utils.createSpaces(prefix.length)}${utils.createArrows((command as string).length)}\n\nERR: Unknown command` + "\n```");
        try {
            await foundCommand.execute(message, args, reply, prefix);
        }
        catch (err: any) {
            Log.error("bot", `Couldn't execute command '${foundCommand.data.name}' as '${command}' due to an unexpected error: ${err}`);
        }
    }
});

client.login(data.bot.token);