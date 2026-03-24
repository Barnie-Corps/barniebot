import { ChatInputCommandInteraction, AutocompleteInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import cacheManager from "../managers/CacheManager";

export default {
    data: new SlashCommandBuilder()
        .setName("custom_responses")
        .setDescription("Manage custom bot responses. (To create custom commands or change existing ones)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s =>
            s.setName("add")
                .setDescription("Add a custom response.")
                .addStringOption(o =>
                    o.setName("command")
                        .setDescription("The command to trigger the response.")
                        .setRequired(true)
                )
                .addStringOption(o =>
                    o.setName("response")
                        .setDescription("The response to send when the command is triggered.")
                        .setRequired(true)
                )
                .addBooleanOption(o =>
                    o.setName("is_regex")
                        .setDescription("Whether the command is a regex pattern.")
                        .setRequired(false)
                )
        )
        .addSubcommand(s =>
            s.setName("remove")
                .setDescription("Remove a custom response.")
                .addStringOption(o =>
                    o.setName("command")
                        .setDescription("The command to remove the response for.")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(s =>
            s.setName("list")
                .setDescription("List all custom responses.")
        ),
    category: "Utility",
    autocomplete: async (interaction: AutocompleteInteraction) => {
        if (!interaction.guildId) return await interaction.respond([]);
        if (interaction.options.getSubcommand() !== "remove") return await interaction.respond([]);
        const focused = String(interaction.options.getFocused() || "").toLowerCase();
        const responses = await db.query("SELECT command FROM custom_responses WHERE guild = ? ORDER BY command ASC LIMIT 50", [interaction.guildId]) as unknown as Array<{ command: string }>;
        const items = responses
            .map(r => String(r.command))
            .filter(command => command.toLowerCase().includes(focused))
            .slice(0, 25)
            .map(command => ({ name: command, value: command }));
        await interaction.respond(items);
    },
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                unknown_subcommand: "Unknown subcommand.",
                no_responses: "No custom responses found.",
                only_guild: "This command can only be used in a guild.",
                no_permission: "You do not have permission to use this command.",
                command_exists: "That custom response already exists.",
                invalid_command: "Command names must be between 1 and 64 characters.",
                invalid_response: "Response text must be between 1 and 1800 characters.",
                response_not_found: "That custom response does not exist."
            },
            common: {
                custom_responses: "Custom responses:"
            },
            success: {
                added: "Custom response added",
                removed: "Custom response removed"
            }
        };
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        if (!interaction.guildId) return await utils.safeInteractionRespond(interaction, texts.errors.only_guild);
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return await utils.safeInteractionRespond(interaction, texts.errors.no_permission);
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case "add": {
                const command = interaction.options.getString("command", true).trim();
                const response = interaction.options.getString("response", true).trim();
                const isRegex = interaction.options.getBoolean("is_regex") ?? false;
                if (command.length < 1 || command.length > 64) return await utils.safeInteractionRespond(interaction, texts.errors.invalid_command);
                if (response.length < 1 || response.length > 1800) return await utils.safeInteractionRespond(interaction, texts.errors.invalid_response);
                const existing = await db.query("SELECT id FROM custom_responses WHERE guild = ? AND command = ? LIMIT 1", [interaction.guildId, command]) as unknown as Array<{ id: number }>;
                if (existing[0]) return await utils.safeInteractionRespond(interaction, texts.errors.command_exists);
                await db.query("INSERT INTO custom_responses (guild, command, response, is_regex) VALUES (?, ?, ?, ?)", [interaction.guildId, command, response, isRegex]);
                await cacheManager.delete(utils.customResponsesCacheKey(interaction.guildId));
                await utils.safeInteractionRespond(interaction, `${texts.success.added}: \`${command}\` => \`${response}\``);
                break;
            }
            case "remove": {
                const command = interaction.options.getString("command", true).trim();
                const existing = await db.query("SELECT id FROM custom_responses WHERE guild = ? AND command = ? LIMIT 1", [interaction.guildId, command]) as unknown as Array<{ id: number }>;
                if (!existing[0]) return await utils.safeInteractionRespond(interaction, texts.errors.response_not_found);
                await db.query("DELETE FROM custom_responses WHERE guild = ? AND command = ?", [interaction.guildId, command]);
                await cacheManager.delete(utils.customResponsesCacheKey(interaction.guildId));
                await utils.safeInteractionRespond(interaction, texts.success.removed);
                break;
            }
            case "list": {
                const responses = await db.query("SELECT * FROM custom_responses WHERE guild = ? ORDER BY command ASC", [interaction.guildId]) as unknown as Array<{ command: string; response: string }>;
                if (responses.length === 0) {
                    await utils.safeInteractionRespond(interaction, texts.errors.no_responses);
                } else {
                    const responseList = responses.map((r, i) => `${i + 1}. **${r.command}** → ${r.response}`).join("\n");
                    if (responseList.length > 1800) {
                        return await utils.sendLongTextResponse(interaction, `${texts.common.custom_responses}\n${responseList}`, texts.common.custom_responses, "custom-responses");
                    }
                    await utils.safeInteractionRespond(interaction, `${texts.common.custom_responses}\n${responseList}`);
                }
                break;
            }
            default:
                await utils.safeInteractionRespond(interaction, texts.errors.unknown_subcommand);
        }
    }
};
