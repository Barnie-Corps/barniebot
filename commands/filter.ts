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
            default: "Este comando aún está en desarrollo.",
            errors: {
                repeated: "No habilitaste permitir repeticiones al ejecutar el comando. No puedo añadir una palabra repetida.",
                not_admin_delete: "Para poder forzar la eliminación de una palabra o establecerla como protegida, debes ser administrador.",
                not_setup: "Este servidor no está registrado en la base de datos de filtros ->",
                no_guild: "Este comando sólo puede ser ejecutado en un servidor.",
                not_admin_add: "Para poder establecer una palabra como protegida, debes ser administrador.",
                missing_force: "Debes utilizar la opción de forzar para poder eliminar una palabra protegida.",
                no_words: "El contenido del filtro de este servidor está vacío.",
                too_long: "Hay demasiadas palabras en el filtro de este servidor, no puedo mostrarlas en formato de mensaje de discord.",
                invalid_id: "La ID que has proporcionado no es válida.",
                no_results: "No hubo resultados.",
                already_registered: "Este servidor ya está registrado en mi base de datos."
            },
            success: {
                registered: "Este servidor no se encontraba en la base de datos, por lo tanto, ha sido añadido. Por defecto, el filtro estará activo en el momento que el servidor se registra por primera vez.",
                toggled_off: "Se ha desactivado el filtro en el servidor.",
                toggled_on: "Se ha activado el filtro en el servidor.",
                added_word: "La palabra se ha añadido correctamente al filtro del servidor.",
                removed_word: "La palabra se ha removido correctamente del filtro del servidor."
            },
            common: {
                turned_off: "Recordatorio: El filtro está desactivado en el servidor.",
                protected_word: "Esta palabra está marcada como protegida.",
                was_forced: "Esta eliminación fue forzada.",
                protected_text: "Protegida",
                filter_content_text: "Palabras en el filtro",
                results: "Resultados de",
            },
            setup: {
                msg: "Estás a punto de inicializar el setup del filtro, ¿Deseas continuar?",
                continue_btn: "Continuar",
                cancel_btn: "Cancelar"
            }
        };
        if (lang !== "es") {
            texts = await utils.autoTranslate(texts, "es", lang);
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
                    if (!allow_repeat) {
                        const foundWord: any = await db.query("SELECT * FROM filter_words WHERE guild = ? AND content = ?", [interaction.guildId, word.toLowerCase()]);
                        if (foundWord[0]) return await interaction.editReply(texts.errors.repeated);
                        if (isProtected && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) return await interaction.editReply(texts.errors.not_admin_add);
                        await db.query("INSERT INTO filter_words SET ?", [{ guild: interaction.guildId, content: word.toLowerCase(), protected: isProtected ? true : false }]);
                    }
                    if (!Boolean(filterMain.enabled)) await interaction.editReply(`${texts.success.added_word} ${isProtected ? ` ${texts.common.protected_word}` : ""}\n${texts.common.turned_off}`);
                    else await interaction.editReply(`${texts.success.added_word} ${isProtected ? ` ${texts.common.protected_word}` : ""}`);
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
                            fs.writeFileSync(filePath, `${texts.common.filter_content_text} [${words.length}]\n\n${mapped.join("\n")}`, { encoding: "utf-8"});
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
                        .setCustomId("cancel_setup")
                        .setLabel(texts.setup.cancel_btn)
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