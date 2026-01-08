import { ChannelType, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder, TextChannel } from "discord.js";
import utils from "../utils";
import langs from "langs";
import db from "../mysql/database";
import type { GlobalChat } from "../types/interfaces";
import client from "..";

export default {
    data: new SlashCommandBuilder()
        .setName("globalchat")
        .setDescription("Sets the guild's global chat")
        .addSubcommand(s => s.setName("toggle").setDescription("Enables or disables the global chat in the current guild"))
        .addSubcommand(s => s.setName("autotranslate").setDescription("Set the autotranslate option for your guild").addBooleanOption(o => o.setName("status").setDescription("The status to set, true or false (enabled, disabled)").setRequired(true)))
        .addSubcommand(s => s.setName("set").setDescription("Set the global chat channel in the current guild").addChannelOption(o => o.setName("channel").setDescription("The channel to set").setRequired(true)))
        .addSubcommand(s => s.setName("language").setDescription("Sets the server's global chat language").addStringOption(o => o.setName("language").setDescription("The language to set").setRequired(true))),
    category: "Utility",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                not_valid: "The chosen channel is not a text channel, only text channels are allowed.",
                only_guild: "This command can only be executed in servers.",
                not_registered: "Woah, hold on friend, you need to first set a channel...",
                missing_perms: "Hey, you don't have the necessary permissions to do that."
            },
            success: {
                set: "The channel has been successfully set.",
                disabled: "The global chat has been successfully disabled.",
                enabled: "The global chat has been successfully enabled.",
                first_time_enabled: "The channel has been set and, being the first time the global chat is activated in this server, it has been enabled by default. Remember that you can enable automatic translation for messages in a language different from yours.",
            },
            autotranslate: {
                on: "The automatic translator is now enabled on this server.",
                off: "The automatic translator is now disabled on this server."
            },
            language: {
                set: "The new language has been successfully set.",
                unsupported: "The provided language is not supported, try another one."
            }
        }
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        if (interaction.options.getSubcommand()) {
            const subcmd = interaction.options.getSubcommand();
            switch (subcmd) {
                case "set": {
                    if (!interaction.guild) return await utils.safeInteractionRespond(interaction, texts.errors.only_guild);
                    if (!interaction.memberPermissions?.has("ManageChannels")) {
                        await utils.safeInteractionRespond(interaction, texts.errors.missing_perms);
                        break;
                    }
                    const channel = interaction.options.getChannel("channel") as TextChannel;
                    if (channel.type !== ChannelType.GuildText) return await utils.safeInteractionRespond(interaction, texts.errors.not_valid);
                    let chatdb = await db.query("SELECT * FROM globalchats WHERE guild = ?", [interaction.guildId]) as unknown as GlobalChat[];
                    const wh = await channel.createWebhook({
                        name: "GlobalHook"
                    });
                    if (!chatdb[0]) {
                        await db.query("INSERT INTO globalchats SET ?", [{ autotranslate: false, guild: interaction.guildId, channel: channel.id, language: lang, webhook_id: wh.id, webhook_token: wh.token }]);
                        await utils.safeInteractionRespond(interaction, `${texts.success.first_time_enabled}`);
                        break;
                    }
                    await db.query("UPDATE globalchats SET ? WHERE guild = ?", [{ autotranslate: false, channel: channel.id, enabled: true, webhook_id: wh.id, webhook_token: wh.token }, interaction.guildId]);
                    await utils.safeInteractionRespond(interaction, texts.success.set);
                    break;
                }
                case "autotranslate": {
                    if (!interaction.guild) return await utils.safeInteractionRespond(interaction, texts.errors.only_guild);
                    if (!interaction.memberPermissions?.has("ManageChannels")) {
                        await utils.safeInteractionRespond(interaction, texts.errors.missing_perms);
                        break;
                    }
                    const status = interaction.options.getBoolean("status") as boolean;
                    let chatdb = await db.query("SELECT * FROM globalchats WHERE guild = ?", [interaction.guildId]) as unknown as GlobalChat[];
                    if (!chatdb[0]) {
                        await utils.safeInteractionRespond(interaction, texts.errors.not_registered);
                        break;
                    }
                    await db.query("UPDATE globalchats SET ? WHERE guild = ?", [{ autotranslate: status }, interaction.guildId]);
                    await utils.safeInteractionRespond(interaction, status ? texts.autotranslate.on : texts.autotranslate.off);
                    break;
                }
                case "language": {
                    if (!interaction.guild) return await utils.safeInteractionRespond(interaction, texts.errors.only_guild);
                    if (!interaction.memberPermissions?.has("ManageChannels")) {
                        await utils.safeInteractionRespond(interaction, texts.errors.missing_perms);
                        break;
                    }
                    const language = (interaction.options.getString("language") as string).toLowerCase();
                    let chatdb = await db.query("SELECT * FROM globalchats WHERE guild = ?", [interaction.guildId]) as unknown as GlobalChat[];
                    if (!chatdb[0]) {
                        await utils.safeInteractionRespond(interaction, texts.errors.not_registered);
                        break;
                    }
                    if (!langs.has(1, language) || language === "br" || language === "ch") {
                        await utils.safeInteractionRespond(interaction, texts.language.unsupported);
                        break;
                    }
                    await db.query("UPDATE globalchats SET language = ? WHERE guild = ?", [language, interaction.guildId]);
                    await utils.safeInteractionRespond(interaction, texts.language.set);
                    break;
                }
                case "toggle": {
                    if (!interaction.guild) return await utils.safeInteractionRespond(interaction, texts.errors.only_guild);
                    if (!interaction.memberPermissions?.has("ManageChannels")) {
                        await utils.safeInteractionRespond(interaction, texts.errors.missing_perms);
                        break;
                    }
                    let chatdb = await db.query("SELECT * FROM globalchats WHERE guild = ?", [interaction.guildId]) as unknown as GlobalChat[];
                    if (!chatdb[0]) {
                        await utils.safeInteractionRespond(interaction, texts.errors.not_registered);
                        break;
                    }
                    await db.query("UPDATE globalchats SET enabled = ? WHERE guild = ?", [chatdb[0].enabled ? false : true, interaction.guildId]);
                    await utils.safeInteractionRespond(interaction, chatdb[0].enabled ? texts.success.disabled : texts.success.enabled);
                    break;
                }
            }
            return;
        }
    },
    ephemeral: true
}