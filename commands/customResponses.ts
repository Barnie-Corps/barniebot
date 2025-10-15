import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel, } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import data from "../data";
import ai from "../ai";
import * as fs from "fs";

export default {
    data: new SlashCommandBuilder()
        .setName("custom_responses")
        .setDescription("Manage custom bot responses. (To create custom commands or change existing ones)")
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
                )
        )
        .addSubcommand(s =>
            s.setName("list")
                .setDescription("List all custom responses.")
        ),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                unknown_subcommand: "Unknown subcommand.",
                no_responses: "No custom responses found.",
                only_guild: "This command can only be used in a guild.",
                no_permission: "You do not have permission to use this command.",
            },
            common: {
                custom_responses: "Custom responses:",
            },
            success: {
                added: `Custom response added`,
                removed: `Custom response removed`,
            }
        };
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        if (!interaction.guildId) return await interaction.editReply(texts.errors.only_guild);
        if (!interaction.memberPermissions?.has("ManageGuild")) return await interaction.editReply(texts.errors.no_permission);
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case "add": {
                const command = interaction.options.getString("command", true);
                const response = interaction.options.getString("response", true);
                await db.query("INSERT INTO custom_responses (guild, command, response) VALUES (?, ?, ?)", [interaction.guildId, command, response]);
                await interaction.editReply(`${texts.success.added}: \`${command}\` => \`${response}\``);
                break;
            }
            case "remove": {
                const command = interaction.options.getString("command", true);
                await db.query("DELETE FROM custom_responses WHERE guild = ? AND command = ?", [interaction.guildId, command]);
                await interaction.editReply(texts.success.removed);
                break;
            }
            case "list": {
                const responses: any = await db.query("SELECT * FROM custom_responses WHERE guild = ?", [interaction.guildId]);
                if (responses.length === 0) {
                    await interaction.editReply(texts.errors.no_responses);
                } else {
                    const responseList = responses.map((r: any) => `\`${r.command}\` => \`${r.response}\``).join("\n");
                    await interaction.editReply(`${texts.common.custom_responses}\n${responseList}`);
                }
                break;
            }
        }
    }
}