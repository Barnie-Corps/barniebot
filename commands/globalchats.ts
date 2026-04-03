import { ChannelType, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, TextChannel } from "discord.js";
import utils from "../utils";
import langs from "langs";
import db from "../mysql/database";
import type { GlobalChat } from "../types/interfaces";
import client from "..";
import cacheManager from "../managers/CacheManager";

export default {
    data: new SlashCommandBuilder()
        .setName("globalchat")
        .setDescription("Sets the guild's global chat")
        .addSubcommand(s => s.setName("toggle").setDescription("Enables or disables the global chat in the current guild"))
        .addSubcommand(s => s.setName("autotranslate").setDescription("Set the autotranslate option for your guild").addBooleanOption(o => o.setName("status").setDescription("The status to set, true or false (enabled, disabled)").setRequired(true)))
        .addSubcommand(s => s.setName("set").setDescription("Set the global chat channel in the current guild").addChannelOption(o => o.setName("channel").setDescription("The channel to set").setRequired(true)))
        .addSubcommand(s => s.setName("language").setDescription("Sets the server's global chat language").addStringOption(o => o.setName("language").setDescription("The language to set").setRequired(true)))
        .addSubcommand(s => s.setName("status").setDescription("Shows this server's global chat status"))
        .addSubcommand(s => s.setName("stats").setDescription("Shows network-level global chat statistics"))
        .addSubcommand(s => s.setName("test").setDescription("Tests this server's global chat webhook and channel setup")),
    category: "Utility",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                not_valid: "The chosen channel is not a text channel, only text channels are allowed.",
                only_guild: "This command can only be executed in servers.",
                not_registered: "Woah, hold on friend, you need to first set a channel...",
                missing_perms: "Hey, you don't have the necessary permissions to do that.",
                webhook_invalid: "The configured webhook is invalid or missing.",
                channel_missing: "The configured global chat channel is missing.",
                webhook_test_failed: "Global chat test failed."
            },
            success: {
                set: "The channel has been successfully set.",
                disabled: "The global chat has been successfully disabled.",
                enabled: "The global chat has been successfully enabled.",
                first_time_enabled: "The channel has been set and, being the first time the global chat is activated in this server, it has been enabled by default. Remember that you can enable automatic translation for messages in a language different from yours.",
                webhook_test_ok: "Global chat test completed successfully."
            },
            autotranslate: {
                on: "The automatic translator is now enabled on this server.",
                off: "The automatic translator is now disabled on this server."
            },
            language: {
                set: "The new language has been successfully set.",
                unsupported: "The provided language is not supported, try another one."
            },
            status: {
                title: "Global Chat Status",
                network_title: "Global Chat Network Stats",
                channel: "Channel",
                enabled: "Enabled",
                autotranslate: "Autotranslate",
                language: "Language",
                webhook: "Webhook",
                connected_guilds: "Connected guilds",
                enabled_guilds: "Enabled guilds",
                autotranslate_guilds: "Autotranslate guilds",
                this_guild: "This guild",
                healthy: "Healthy",
                unhealthy: "Needs attention",
                not_set: "Not set"
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
                        await cacheManager.delete(utils.globalChatCacheKey(interaction.guildId!));
                        await utils.safeInteractionRespond(interaction, `${texts.success.first_time_enabled}`);
                        break;
                    }
                    await db.query("UPDATE globalchats SET ? WHERE guild = ?", [{ autotranslate: false, channel: channel.id, enabled: true, webhook_id: wh.id, webhook_token: wh.token }, interaction.guildId]);
                    await cacheManager.delete(utils.globalChatCacheKey(interaction.guildId!));
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
                    await cacheManager.delete(utils.globalChatCacheKey(interaction.guildId!));
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
                    await cacheManager.delete(utils.globalChatCacheKey(interaction.guildId!));
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
                    await cacheManager.delete(utils.globalChatCacheKey(interaction.guildId!));
                    await utils.safeInteractionRespond(interaction, chatdb[0].enabled ? texts.success.disabled : texts.success.enabled);
                    break;
                }
                case "status": {
                    if (!interaction.guild) return await utils.safeInteractionRespond(interaction, texts.errors.only_guild);
                    if (!interaction.memberPermissions?.has("ManageChannels")) {
                        await utils.safeInteractionRespond(interaction, texts.errors.missing_perms);
                        break;
                    }
                    const rows = await db.query("SELECT * FROM globalchats WHERE guild = ?", [interaction.guildId]) as unknown as any[];
                    const row = rows?.[0];
                    if (!row) {
                        await utils.safeInteractionRespond(interaction, texts.errors.not_registered);
                        break;
                    }
                    const channel = interaction.guild.channels.cache.get(row.channel);
                    let webhookHealthy = false;
                    if (row.webhook_id && row.webhook_token) {
                        try {
                            await interaction.client.fetchWebhook(row.webhook_id, row.webhook_token);
                            webhookHealthy = true;
                        } catch { }
                    }
                    const embed = new EmbedBuilder()
                        .setColor(webhookHealthy && channel ? "Green" : "Orange")
                        .setTitle(texts.status.title)
                        .addFields(
                            { name: texts.status.channel, value: channel ? `<#${row.channel}>` : texts.status.not_set, inline: true },
                            { name: texts.status.enabled, value: row.enabled ? "true" : "false", inline: true },
                            { name: texts.status.autotranslate, value: row.autotranslate ? "true" : "false", inline: true },
                            { name: texts.status.language, value: row.language || texts.status.not_set, inline: true },
                            { name: texts.status.webhook, value: webhookHealthy ? texts.status.healthy : texts.status.unhealthy, inline: true }
                        );
                    await utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
                    break;
                }
                case "stats": {
                    if (!interaction.guild) return await utils.safeInteractionRespond(interaction, texts.errors.only_guild);
                    if (!interaction.memberPermissions?.has("ManageChannels")) {
                        await utils.safeInteractionRespond(interaction, texts.errors.missing_perms);
                        break;
                    }
                    const [totalRows, enabledRows, autoRows, currentRows] = await Promise.all([
                        db.query("SELECT COUNT(*) AS count FROM globalchats"),
                        db.query("SELECT COUNT(*) AS count FROM globalchats WHERE enabled = TRUE"),
                        db.query("SELECT COUNT(*) AS count FROM globalchats WHERE autotranslate = TRUE"),
                        db.query("SELECT * FROM globalchats WHERE guild = ? LIMIT 1", [interaction.guildId])
                    ]) as any;
                    const current = currentRows?.[0];
                    const embed = new EmbedBuilder()
                        .setColor("Blue")
                        .setTitle(texts.status.network_title)
                        .addFields(
                            { name: texts.status.connected_guilds, value: String(totalRows?.[0]?.count ?? 0), inline: true },
                            { name: texts.status.enabled_guilds, value: String(enabledRows?.[0]?.count ?? 0), inline: true },
                            { name: texts.status.autotranslate_guilds, value: String(autoRows?.[0]?.count ?? 0), inline: true },
                            { name: texts.status.this_guild, value: current ? `${current.enabled ? "enabled" : "disabled"} • ${current.language}` : texts.status.not_set, inline: false }
                        );
                    await utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
                    break;
                }
                case "test": {
                    if (!interaction.guild) return await utils.safeInteractionRespond(interaction, texts.errors.only_guild);
                    if (!interaction.memberPermissions?.has("ManageChannels")) {
                        await utils.safeInteractionRespond(interaction, texts.errors.missing_perms);
                        break;
                    }
                    const rows = await db.query("SELECT * FROM globalchats WHERE guild = ?", [interaction.guildId]) as unknown as any[];
                    const row = rows?.[0];
                    if (!row) {
                        await utils.safeInteractionRespond(interaction, texts.errors.not_registered);
                        break;
                    }
                    const channel = interaction.guild.channels.cache.get(row.channel) as TextChannel | undefined;
                    if (!channel) {
                        await utils.safeInteractionRespond(interaction, texts.errors.channel_missing);
                        break;
                    }
                    if (!row.webhook_id || !row.webhook_token) {
                        await utils.safeInteractionRespond(interaction, texts.errors.webhook_invalid);
                        break;
                    }
                    try {
                        await interaction.client.fetchWebhook(row.webhook_id, row.webhook_token);
                        await utils.safeInteractionRespond(interaction, texts.success.webhook_test_ok);
                    } catch {
                        await utils.safeInteractionRespond(interaction, texts.errors.webhook_test_failed);
                    }
                    break;
                }
            }
            return;
        }
    },
    ephemeral: true
}
