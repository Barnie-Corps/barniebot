import { ChannelType, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder, TextChannel } from "discord.js";
import utils from "../utils";
import langs from "langs";
import db from "../mysql/database";
import client from "..";

export default {
    data: new SlashCommandBuilder()
        .setName("globalchat")
        .setDescription("Sets the guild's global chat")
        .addSubcommand(s => s.setName("toggle").setDescription("Enables or disables the global chat in the current guild"))
        .addSubcommand(s => s.setName("autotranslate").setDescription("Set the autotranslate option for your guild").addBooleanOption(o => o.setName("status").setDescription("The status to set, true or false (enabled, disabled)").setRequired(true)))
        .addSubcommand(s => s.setName("set").setDescription("Set the global chat channel in the current guild").addChannelOption(o => o.setName("channel").setDescription("The channel to set").setRequired(true)))
        .addSubcommand(s => s.setName("language").setDescription("Sets the server's global chat language").addStringOption(o => o.setName("language").setDescription("The language to set").setRequired(true))),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                not_valid: "El canal elegido no es de texto, sólo se permiten canales de texto.",
                only_guild: "Este comando sólo puede ejecutarse en servidores.",
                not_registered: "Woah, tranquilo amigo, tienes que primero establecer un canal...",
                missing_perms: "Hey, no tienes los permisos necesarios para hacer eso."
            },
            success: {
                set: "El canal ha sido establecido con éxito.",
                disabled: "El chat global ha sido deshabilitado con éxito.",
                enabled: "El chat global ha sido habilitado con éxito.",
                first_time_enabled: "El canal ha sido establecido y, siendo la primera vez que se activa el chat global en este servidor, se ha activado por defecto. Recuerda que puedes activar la traducción automática para mensajes en un idioma distinto al tuyo.",
            },
            autotranslate: {
                on: "El traductor automático está ahora activado en este servidor.",
                off: "El traductor automático está ahora desactivado en este servidor."
            },
            language: {
                set: "El nuevo idioma se ha establecido con éxito.",
                unsupported: "El idioma proporcionado no tiene soporte, intenta con otro."
            }
        }
        if (lang !== "es") {
            texts = await utils.autoTranslate(texts, "es", lang);
        }
        if (interaction.options.getSubcommand()) {
            const subcmd = interaction.options.getSubcommand();
            switch (subcmd) {
                case "set": {
                    if (!interaction.guild) return await interaction.editReply(texts.errors.only_guild);
                    if (!interaction.memberPermissions?.has("ManageChannels")) {
                        await interaction.editReply(texts.errors.missing_perms);
                        break;
                    }
                    const channel = interaction.options.getChannel("channel") as TextChannel;
                    if (channel.type !== ChannelType.GuildText) return await interaction.editReply(texts.errors.not_valid);
                    let chatdb: any = await db.query("SELECT * FROM globalchats WHERE guild = ?", [interaction.guildId]);
                    const wh = await channel.createWebhook({
                        name: "GlobalHook",
                        avatar: client.user?.displayAvatarURL()
                    });
                    if (!chatdb[0]) {
                        await db.query("INSERT INTO globalchats SET ?", [{ guild: interaction.guildId, channel: channel.id, language: lang, webhook_id: wh.id, webhook_token: wh.token }]);
                        await interaction.editReply(`${texts.success.first_time_enabled}`);
                        break;
                    }
                    await db.query("UPDATE globalchats SET ? WHERE guild = ?", [{ autotranslate: false, channel: channel.id, enabled: true, webhook_id: wh.id, webhook_token: wh.token }, interaction.guildId]);
                    await interaction.editReply(texts.success.set);
                    break;
                }
                case "autotranslate": {
                    if (!interaction.guild) return await interaction.editReply(texts.errors.only_guild);
                    if (!interaction.memberPermissions?.has("ManageChannels")) {
                        await interaction.editReply(texts.errors.missing_perms);
                        break;
                    }
                    const status = interaction.options.getBoolean("status") as boolean;
                    let chatdb: any = await db.query("SELECT * FROM globalchats WHERE guild = ?", [interaction.guildId]);
                    if (!chatdb[0]) {
                        await interaction.editReply(texts.errors.not_registered);
                        break;
                    }
                    await db.query("UPDATE globalchats SET ? WHERE guild = ?", [{ autotranslate: status }, interaction.guildId]);
                    await interaction.editReply(status ? texts.autotranslate.on : texts.autotranslate.off);
                    break;
                }
                case "language": {
                    if (!interaction.guild) return await interaction.editReply(texts.errors.only_guild);
                    if (!interaction.memberPermissions?.has("ManageChannels")) {
                        await interaction.editReply(texts.errors.missing_perms);
                        break;
                    }
                    const language = (interaction.options.getString("language") as string).toLowerCase();
                    let chatdb: any = await db.query("SELECT * FROM globalchats WHERE guild = ?", [interaction.guildId]);
                    if (!chatdb[0]) {
                        await interaction.editReply(texts.errors.not_registered);
                        break;
                    }
                    if (!langs.has(1, language) || language === "br" || language === "ch") {
                        await interaction.editReply(texts.language.unsupported);
                        break;
                    }
                    await db.query("UPDATE globalchats SET language = ? WHERE guild = ?", [language, interaction.guildId]);
                    await interaction.editReply(texts.language.set);
                    break;
                }
                case "toggle": {
                    if (!interaction.guild) return await interaction.editReply(texts.errors.only_guild);
                    if (!interaction.memberPermissions?.has("ManageChannels")) {
                        await interaction.editReply(texts.errors.missing_perms);
                        break;
                    }
                    let chatdb: any = await db.query("SELECT * FROM globalchats WHERE guild = ?", [interaction.guildId]);
                    if (!chatdb[0]) {
                        await interaction.editReply(texts.errors.not_registered);
                        break;
                    }
                    await db.query("UPDATE globalchats SET enabled = ? WHERE guild = ?", [chatdb[0].enabled ? false : true, interaction.guildId]);
                    await interaction.editReply(chatdb[0].enabled ? texts.success.disabled : texts.success.disabled);
                    break;
                }
            }
            return;
        }
    },
    ephemeral: true
}