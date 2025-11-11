import { ActionRow, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, Embed, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, TimestampStyles, time } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import data from "../data";
import path from "path";
import * as fs from "fs";
export default {
    data: new SlashCommandBuilder()
        .setName("filter")
        .setDescription("Manages guild filter")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(s =>
            s.setName("view")
                .setDescription("Shows the filter content")
                .addStringOption(o =>
                    o.setName("format")
                        .setDescription("Sets the format the bot will use to display the filter content")
                        .addChoices({ name: "File", value: "file" }, { name: "Message", value: "message" })
                        .setRequired(true)
                )
        )
        .addSubcommand(s =>
            s.setName("add")
                .setDescription("Adds a word to the filter")
                .addStringOption(o =>
                    o.setName("word")
                        .setDescription("The word you want to add")
                        .setRequired(true)
                )
                .addBooleanOption(o =>
                    o.setName("allow_repeat")
                        .setDescription("If set true, the bot will not allow to add this word if repeated")
                        .setRequired(true)
                )
                .addBooleanOption(o =>
                    o.setName("single")
                        .setDescription("If set true, this word will be considered as a single word (Not part of another word)")
                        .setRequired(true)
                )
                .addBooleanOption(o =>
                    o.setName("protected")
                        .setDescription(`If set true, this word will be added as "protected".`)
                )
        )
        .addSubcommand(s =>
            s.setName("remove")
                .setDescription("Removes a word from the filter. (/filter view or /filter search)")
                .addIntegerOption(o =>
                    o.setName("id")
                        .setDescription("Word ID (See with /filter view or /filter search)")
                        .setRequired(true)
                )
                .addBooleanOption(o =>
                    o.setName("force")
                        .setDescription("If set true, forces this word deletion (Only guild admins can use this)")
                        .setRequired(true)
                )
        )
        .addSubcommand(s =>
            s.setName("search")
                .setDescription("Displays filter content that matches a given search query")
                .addStringOption(o =>
                    o.setName("query")
                        .setDescription("Search query for the filter (Can include multiple queries, separated by commas without spaces)")
                        .setRequired(true)
                )
                .addStringOption(o =>
                    o.setName("format")
                        .setDescription("Sets the format the bot will use to display the filter content")
                        .addChoices({ name: "File", value: "file" }, { name: "Message", value: "message" })
                        .setRequired(true)
                )
        )
        .addSubcommand(s =>
            s.setName("toggle")
                .setDescription("Toggles filter status. On -> Off / Off -> On")
        )
        .addSubcommand(s =>
            s.setName("setup")
                .setDescription("Initializes the filter setup wizard (Can't be executed twice)")
        ),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            default: "This command is still in development.",
            errors: {
                repeated: "You didn't enable allow repeats when executing the command. I can't add a repeated word.",
                not_admin_delete: "To force the deletion of a word or set it as protected, you must be an administrator.",
                not_setup: "This server is not registered in the filter database ->",
                no_guild: "This command can only be executed in a server.",
                not_admin_add: "To set a word as protected, you must be an administrator.",
                missing_force: "You must use the force option to delete a protected word.",
                no_words: "This server's filter content is empty.",
                too_long: "There are too many words in this server's filter, I can't display them in a Discord message format.",
                invalid_id: "The ID you provided is not valid.",
                no_results: "There were no results.",
                already_registered: "This server is already registered in my database."
            },
            success: {
                registered: "This server was not found in the database, therefore it has been added. By default, the filter will be active when the server is registered for the first time.",
                toggled_off: "The filter has been disabled on the server.",
                toggled_on: "The filter has been enabled on the server.",
                added_word: "The word has been successfully added to the server filter.",
                removed_word: "The word has been successfully removed from the server filter."
            },
            common: {
                turned_off: "Reminder: The filter is disabled on the server.",
                protected_word: "This word is marked as protected.",
                was_forced: "This deletion was forced.",
                protected_text: "Protected",
                filter_content_text: "Words in filter",
                results: "Results for",
                single_word: "This word is marked as a single word. (Cannot be part of another word)"
            },
            setup: {
                msg: "You are about to initialize the filter setup, do you want to continue?",
                continue_btn: "Continue",
                cancel_btn: "Cancel"
            }
        };
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        // if (!data.bot.owners.includes(interaction.user.id)) return await interaction.editReply(texts.default);
        if (!interaction.inGuild()) return await interaction.editReply(texts.errors.no_guild);
        const subcmd = interaction.options.getSubcommand();
        if (subcmd) {
            const filterMain: any = (await db.query("SELECT * FROM filter_configs WHERE guild = ?", [interaction.guildId]) as any)[0];
            switch (subcmd) {
                case "toggle": {
                    if (!filterMain) {
                        await db.query("INSERT INTO filter_configs SET ?", [{
                            guild: interaction.guildId,
                            enabled: true
                        }]);
                        await interaction.editReply(texts.success.registered);
                        break;
                    }
                    else {
                        const set = Number(filterMain.enabled) === 1 ? false : true;
                        await db.query("UPDATE filter_configs SET ? WHERE guild = ?", [{ enabled: set }, interaction.guildId]);
                        await interaction.editReply(`${set ? texts.success.toggled_on : texts.success.toggled_off}`);
                        break;
                    }
                }
                case "add": {
                    if (!filterMain) return await interaction.editReply(`${texts.errors.not_setup} /filter setup`);
                    const word = interaction.options.getString("word") as string;
                    const allow_repeat = interaction.options.getBoolean("allow_repeat") as boolean;
                    const isProtected = interaction.options.getBoolean("protected") as boolean;
                    const isSingle = interaction.options.getBoolean("single") as boolean;
                    if (!allow_repeat) {
                        const foundWord: any = await db.query("SELECT * FROM filter_words WHERE guild = ? AND content = ?", [interaction.guildId, word.toLowerCase()]);
                        if (foundWord[0]) return await interaction.editReply(texts.errors.repeated);
                        if (isProtected && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) return await interaction.editReply(texts.errors.not_admin_add);
                        await db.query("INSERT INTO filter_words SET ?", [{ guild: interaction.guildId, content: word.toLowerCase(), protected: isProtected ? true : false, single: isSingle ? true : false }]);
                    }
                    if (!Boolean(filterMain.enabled)) await interaction.editReply(`${texts.success.added_word} ${isProtected ? ` ${texts.common.protected_word}` : ""}\n${texts.common.turned_off}`);
                    else await interaction.editReply(`${texts.success.added_word} ${isProtected ? ` ${texts.common.protected_word}` : ""}${isSingle ? ` ${texts.common.single_word}` : ""}`);
                    break;
                }
                case "view": {
                    if (!filterMain) return await interaction.editReply(`${texts.errors.not_setup} /filter setup`);
                    const format = interaction.options.getString("format") as string;
                    const words: any = await db.query("SELECT * FROM filter_words WHERE guild = ?", [interaction.guildId]);
                    if (words.length < 1) return await interaction.editReply(texts.errors.no_words);
                    const mapped = words.map((w: any) => `[${w.id}] ${w.content} ${Boolean(w.protected) ? `[${texts.common.protected_text}]` : ""}`);
                    switch (format) {
                        case "file": {
                            const filePath = path.join(__dirname, `filter_content_${interaction.guildId}.txt`);
                            fs.writeFileSync(filePath, `${texts.common.filter_content_text} [${words.length}]\n\n${mapped.join("\n")}`, { encoding: "utf-8" });
                            await interaction.editReply({ content: "<a:marcano:800125893892505662>", files: [filePath] });
                            fs.unlinkSync(filePath);
                            break;
                        }
                        case "message": {
                            const finalText = "```\n" + `${texts.common.filter_content_text} [${words.length}]\n${mapped.join("\n")}` + "\n```";
                            if (finalText.length > 2000) return await interaction.editReply(texts.errors.too_long);
                            await interaction.editReply(finalText);
                            break;
                        }
                    }
                    break;
                }
                case "search": {
                    if (!filterMain) return await interaction.editReply(`${texts.errors.not_setup} /filter setup`);
                    const queries = interaction.options.getString("query") as string;
                    const format = interaction.options.getString("format") as string;
                    const words: any = await db.query("SELECT * FROM filter_words WHERE guild = ?", [interaction.guildId]);
                    if (words.length < 1) return await interaction.editReply(texts.errors.no_words);
                    const filtered = words.filter((w: any) => queries.trim().split(",").some((q: string) => w.content.includes(q.toLowerCase())));
                    if (filtered.length < 1) return await interaction.editReply(texts.errors.no_results);
                    const mapped = filtered.map((w: any) => `[${w.id}] ${w.content} ${Boolean(w.protected) ? `[${texts.common.protected_text}]` : ""}`);
                    switch (format) {
                        case "file": {
                            const filePath = path.join(__dirname, `filter_content_${interaction.guildId}.txt`);
                            fs.writeFileSync(filePath, `${texts.common.results}: ${queries.trim().split(",").join(", ")} [${words.length}]\n\n${mapped.join("\n")}`, { encoding: "utf-8" });
                            await interaction.editReply({ content: "<a:marcano:800125893892505662>", files: [filePath] });
                            fs.unlinkSync(filePath);
                            break;
                        }
                        case "message": {
                            const finalText = "```\n" + `${texts.common.results}: ${queries.trim().split(",").join(", ")} [${filtered.length}]\n${mapped.join("\n")}` + "\n```";
                            if (finalText.length > 2000) return await interaction.editReply(texts.errors.too_long);
                            await interaction.editReply(finalText);
                            break;
                        }
                    }
                    break;
                }
                case "remove": {
                    if (!filterMain) return await interaction.editReply(`${texts.errors.not_setup} /filter setup`);
                    const wid = interaction.options.getInteger("id") as number;
                    const force = interaction.options.getBoolean("force") as boolean;
                    if (force && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) return await interaction.editReply(texts.errors.not_admin_delete);
                    const word: any = await db.query("SELECT * FROM filter_words WHERE guild = ? AND id = ?", [interaction.guildId, wid]);
                    if (!word[0]) return await interaction.editReply(texts.errors.invalid_id);
                    if (Boolean(word[0].protected) && !force) return await interaction.editReply(`${texts.common.protected_word} ${texts.errors.missing_force}`);
                    await db.query("DELETE FROM filter_words WHERE guild = ? AND id = ?", [interaction.guildId, wid]);
                    await interaction.editReply(`${texts.success.removed_word} -> \`${word[0].content}\`${Boolean(word[0]) && force ? `. ${texts.common.was_forced}` : ""}`);
                    break;
                }
                case "setup": {
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setLabel("Continuar")
                                .setCustomId(`continue_setup-${interaction.user.id}-${!filterMain ? "0" : "1"}`)
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setLabel(texts.setup.cancel_btn)
                                .setCustomId(`cancel_setup-${interaction.user.id}-${!filterMain ? "0" : "1"}`)
                                .setStyle(ButtonStyle.Danger)
                        )
                    await interaction.editReply({ content: texts.setup.msg, components: [row as any] });
                }
            }
            return;
        }
    },
    ephemeral: false
}