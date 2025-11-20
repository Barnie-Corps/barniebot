import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import data from "../data";

export default {
    data: new SlashCommandBuilder()
        .setName("login")
        .setDescription("Login to your RPG account")
        .addStringOption(option =>
            option.setName("username")
                .setDescription("Your account username")
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName("password")
                .setDescription("Your account password")
                .setRequired(true)
        ),
    category: "RPG",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                invalid_credentials: "Invalid username or password",
                not_verified: "Your account is not verified. Please verify it using `/register verify`",
                already_logged: "This account is already logged in on another Discord account",
                frozen: "Your account has been frozen",
                banned: "Your account has been banned",
                no_character: "You need to create a character first! Use `/rpg create` to start your adventure"
            },
            success: {
                logged_in: "Welcome back! You have successfully logged in ",
                session_info: "Session established at "
            },
            titles: {
                login_success: "🎮 Login Successful",
                login_failed: "❌ Login Failed"
            }
        };

        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }

        const username = interaction.options.getString("username") as string;
        const password = interaction.options.getString("password") as string;

        const account: any = await db.query("SELECT * FROM registered_accounts WHERE username = ?", [username]);

        if (account.length < 1) {
            const failEmbed = new EmbedBuilder()
                .setColor("#FF0000")
                .setTitle(texts.titles.login_failed)
                .setDescription(texts.errors.invalid_credentials)
                .setTimestamp();
            return interaction.editReply({ embeds: [failEmbed], content: "" });
        }

        const decryptedPassword = utils.decryptWithAES(data.bot.encryption_key, account[0].password);

        if (decryptedPassword !== password) {
            const failEmbed = new EmbedBuilder()
                .setColor("#FF0000")
                .setTitle(texts.titles.login_failed)
                .setDescription(texts.errors.invalid_credentials)
                .setTimestamp();
            return interaction.editReply({ embeds: [failEmbed], content: "" });
        }

        if (!account[0].verified) {
            const failEmbed = new EmbedBuilder()
                .setColor("#FFA500")
                .setTitle(texts.titles.login_failed)
                .setDescription(texts.errors.not_verified)
                .setTimestamp();
            return interaction.editReply({ embeds: [failEmbed], content: "" });
        }

        const status: any = await db.query("SELECT * FROM rpg_account_status WHERE account_id = ?", [account[0].id]);
        if (status.length > 0) {
            if (status[0].frozen) {
                const failEmbed = new EmbedBuilder()
                    .setColor("#0000FF")
                    .setTitle(texts.titles.login_failed)
                    .setDescription(`${texts.errors.frozen}\n**Reason:** ${status[0].frozen_reason || "No reason provided"}`)
                    .setTimestamp();
                return interaction.editReply({ embeds: [failEmbed], content: "" });
            }
            if (status[0].banned) {
                const failEmbed = new EmbedBuilder()
                    .setColor("#000000")
                    .setTitle(texts.titles.login_failed)
                    .setDescription(`${texts.errors.banned}\n**Reason:** ${status[0].banned_reason || "No reason provided"}`)
                    .setTimestamp();
                return interaction.editReply({ embeds: [failEmbed], content: "" });
            }
        }

        const existingSession: any = await db.query("SELECT * FROM rpg_sessions WHERE account_id = ? AND active = TRUE", [account[0].id]);

        if (existingSession.length > 0) {
            const failEmbed = new EmbedBuilder()
                .setColor("#FF6600")
                .setTitle(texts.titles.login_failed)
                .setDescription(texts.errors.already_logged)
                .addFields(
                    { name: "Logged in as", value: `<@${existingSession[0].uid}>`, inline: true },
                    { name: "Since", value: `<t:${Math.floor(existingSession[0].logged_in_at / 1000)}:R>`, inline: true }
                )
                .setTimestamp();
            return interaction.editReply({ embeds: [failEmbed], content: "" });
        }

        const character: any = await db.query("SELECT * FROM rpg_characters WHERE account_id = ?", [account[0].id]);

        await db.query("INSERT INTO rpg_sessions SET ?", [{
            account_id: account[0].id,
            uid: interaction.user.id,
            logged_in_at: Date.now(),
            last_activity: Date.now(),
            active: true
        }]);

        await db.query("UPDATE registered_accounts SET last_login = ?, last_user_logged = ? WHERE id = ?", [Date.now(), interaction.user.id, account[0].id]);

        await db.query("INSERT INTO logins SET ?", [{
            uid: interaction.user.id,
            at: Date.now(),
            status: true
        }]);

        if (character.length < 1) {
            const noCharEmbed = new EmbedBuilder()
                .setColor("#FFA500")
                .setTitle(texts.titles.login_success)
                .setDescription(texts.success.logged_in + username)
                .addFields(
                    { name: "⚠️ No Character", value: "You don't have a character yet! Use `/rpg create` to begin your adventure.", inline: false }
                )
                .setFooter({ text: texts.success.session_info + new Date().toLocaleString() })
                .setTimestamp();
            return interaction.editReply({ embeds: [noCharEmbed], content: "" });
        }

        const successEmbed = new EmbedBuilder()
            .setColor("#00FF00")
            .setTitle(texts.titles.login_success)
            .setDescription(texts.success.logged_in + username)
            .addFields(
                { name: "Character", value: character[0].name, inline: true },
                { name: "Level", value: character[0].level.toString(), inline: true },
                { name: "Class", value: character[0].class, inline: true },
                { name: "Gold", value: `💰 ${character[0].gold.toLocaleString()}`, inline: true },
                { name: "HP", value: `❤️ ${character[0].hp}/${character[0].max_hp}`, inline: true },
                { name: "MP", value: `💙 ${character[0].mp}/${character[0].max_mp}`, inline: true }
            )
            .setFooter({ text: texts.success.session_info + new Date().toLocaleString() })
            .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed], content: "" });
    },
    ephemeral: true
};
