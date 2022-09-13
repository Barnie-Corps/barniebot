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
 * Certificate of registration: https://www.copyrighted.com/work/23e3X3GmrHeYiS1d
 */
import * as dotenv from "dotenv";
dotenv.config();
import { EmbedBuilder, ActionRow, GatewayIntentBits, Client, ActivityType, Partials, PermissionFlagsBits } from "discord.js";
import * as fs from "fs";
import data from "./data";
import Log from "./Log";
import queries from "./mysql/queries";
import db from "./mysql/database";
import utils from "./utils";
const client = new Client({
    intents: [GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMessageTyping, GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.DirectMessages, GatewayIntentBits.DirectMessageTyping, GatewayIntentBits.DirectMessageReactions],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.User],
    ws: {
        properties: {
            browser: "Discord Android"
        }
    }
});
(async function () {
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
            const requiredDataProperties: string[] = ["name", "aliases", "requiredGuildPermissions", "guildOnly", "category", "description"];
            const missingDataProperties: string[] = requiredDataProperties.filter(p => !Object.keys(command.data).includes(p));
            if (missingDataProperties.length > 0) {
                Log.warn("commands", `The command file '${cmdFile}' has the following required data properties missing: ${missingDataProperties.map(p => p).join(", ")}. To avoid any error, it hasn't been loaded.`);
                continue;
            }
            if (command.data.requiredGuildPermissions.length > 0 && command.data.guildOnly) {
                const invalidPermissions: any[] = [];
                if (!command.data.requiredGuildPermissions.every((p: any) => {
                    if (!(PermissionFlagsBits as any)[p as string]) {
                        invalidPermissions.push(p);
                        return false;
                    }
                    else return true;
                })) {
                    Log.error("commands", `The guild-only '${command.data.name}' command has the following invalid required permissions: ${invalidPermissions.join(", ")}. To avoid any error, it hasn't been loaded.`);
                    continue;
                }
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
    client.user?.setPresence({ activities: [{ name: `V ${String(process.env.VERSION)}`, type: ActivityType.Playing }] });
    Log.info("bot", `Fetching members from ${client.guilds.cache.size} guilds...`);
    for (const guild of client.guilds.cache.values()) {
        await guild.members.fetch();
    }
    Log.info("bot", `Members fetched from all guilds. Current users cache size: ${client.users.cache.size}`);
});

client.on("messageCreate", async (message): Promise<any> => {
    if (message.author.bot) return;
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
        return message.reply(content).catch((err: any) => {
            Log.error("bot", `Couldn't reply to ${message.author.tag} due to an unexpected error: ${err}`);
        });
    }
    if (command === "none") return;
    else {
        const foundCommand = data.bot.commands.get(command as string) ?? data.bot.commands.find(c => c.data.aliases.includes(command));
        if (!foundCommand) return reply("```\n" + `${prefix}${command} ${args.slice(0).join(" ")}\n${utils.createSpaces(prefix.length)}${utils.createArrows((command as string).length)}\n\nERR: Unknown command.` + "\n```");
        if (foundCommand.data.guildOnly && !message.guild) return;
        const Lang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [message.author.id]) as unknown) as any[]);
        let missingRequiredPermissions: string[] = [];
        if (foundCommand.data.requiredGuildPermissions.length > 0 && foundCommand.data.guildOnly && message.guild) {
            if (!foundCommand.data.requiredGuildPermissions.every((p: any) => {
                if (message.member?.permissions.has(p)) return true;
                else {
                    missingRequiredPermissions.push(p);
                    return false;
                }
            })) return reply("```\n" + `${prefix}${command}\n${utils.createSpaces(`${prefix}`.length)}${utils.createArrows((command as string).length)}\n\nERR: Missing required guild permissions: ${missingRequiredPermissions.map(p => p).join(", ")}.` + "\n```");
        }
        try {
            await foundCommand.execute(message, args, reply, prefix, Lang[0] ? Lang[0].lang : "en");
        }
        catch (err: any) {
            Log.error("bot", `Couldn't execute command '${foundCommand.data.name}' as '${command}' due to an unexpected error: ${err.stack}`);
        }
    }
});
client.on("interactionCreate", async (interaction): Promise<any> => {
    const foundLang = ((await db.query("SELECT * FROM languages WHERE userid = ?", [interaction.user.id]) as unknown) as any[]);
    const Lang = foundLang[0] ? foundLang[0].lang : "en";
    let prefix = "b.";
    if (interaction.guild) {
        const DBPrefix = ((await db.query("SELECT * FROM prefixes WHERE guild = ?", [interaction.guild.id]) as unknown) as any[]);
        if (DBPrefix[0]) {
            prefix = DBPrefix[0].prefix;
        }
    }
    if (interaction.isSelectMenu()) {
        if (interaction.customId.startsWith("commands-")) {
            await interaction.deferReply({ ephemeral: true });
            let authorId = interaction.customId.slice("commands-".length);
            if (interaction.user.id !== authorId) return interaction.editReply(Lang !== "es" ? (await utils.translate("Tú no fuiste quién usó el comando, no puedes cambiar de categoría.", "es", Lang)).text : "Tú no fuiste quién usó el comando, no puedes cambiar de categoría.");
            else {
                const texts = {
                    embed: {
                        description: `Puedes usar el comando **${prefix}command** para ver información de un comando específico.`,
                        footer: "Santiago Morales © 2020 - 2025 All rights reserved.",
                        empty: "Oops... este lugar parece vacío",
                        messageEdited: "El mensaje embed ha sido editado."
                    },
                    categories: {
                        info: "Información",
                        mod: "Moderación",
                        config: "Configuración",
                        fun: "Diversión",
                        support: "Soporte",
                        logs: "Logísitca",
                        utility: "Utilidad",
                        placeholder: "Selecciona una opción..."
                    }
                }
                await utils.parallel({
                    embed: async (callback: any) => {
                        if (Lang !== "es") {
                            texts.embed.description = (await utils.translate(texts.embed.description, "es", Lang)).text;
                            texts.embed.empty = (await utils.translate(texts.embed.empty, "es", Lang)).text;
                            texts.embed.messageEdited = (await utils.translate(texts.embed.messageEdited, "es", Lang)).text;
                        }
                        callback(null, true);
                    },
                    categories: async (callback: any) => {
                        if (Lang !== "es") {
                            for (const [key, value] of Object.entries(texts.categories)) {
                                (texts.categories as any)[`${key}`] = (await utils.translate(value, "es", Lang)).text;
                            }
                        }
                        callback(null, true);
                    }
                });
                const selectedCategory = interaction.values[0].trim().split("_")[0];
                const filteredCommands = data.bot.commands.filter(c => c.data.category === selectedCategory);
                const embed = new EmbedBuilder()
                    .setAuthor({ iconURL: interaction.user.displayAvatarURL(), name: interaction.user.tag })
                    .setTitle((texts.categories as any)[selectedCategory])
                    .setDescription(texts.embed.description)
                    .addFields(
                        {
                            name: Lang === "es" ? "Comandos" : (await utils.translate("Comandos", "es", Lang)).text,
                            value: `${filteredCommands.size > 0 ? filteredCommands.map(c => `**${prefix}${c.data.name}**`).join(", ") : texts.embed.empty}.`
                        }
                    )
                    .setFooter({ text: texts.embed.footer })
                    .setTimestamp()
                    .setColor("Purple")
                await interaction.editReply(texts.embed.messageEdited);
                await interaction.message.edit({ embeds: [embed] });
            }
        }
    }
});

client.login(data.bot.token);

export default client;