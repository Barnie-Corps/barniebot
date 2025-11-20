import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import data from "../data";
import * as fs from "fs";

export default {
    data: new SlashCommandBuilder()
        .setName("register")
        .setDescription("Register or verify a new account in the bot's RPG system.")
        .addSubcommand(s =>
            s.setName("new")
                .setDescription("Register a new account in the bot's RPG system.")
                .addStringOption(option =>
                    option.setName("email")
                        .setDescription("Your email address")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("username")
                        .setDescription("Your unique username (3-20 characters)")
                        .setRequired(true)
                        .setMinLength(3)
                        .setMaxLength(20)
                )
        )
        .addSubcommand(s =>
            s.setName("verify")
                .setDescription("Verify your account with the code sent to your email")
                .addStringOption(option =>
                    option.setName("code")
                        .setDescription("6-digit verification code")
                        .setRequired(true)
                        .setMinLength(6)
                        .setMaxLength(6)
                )
        )
        .addSubcommand(s =>
            s.setName("resend")
                .setDescription("Resend verification code to your email")
                .addStringOption(option =>
                    option.setName("email")
                        .setDescription("Your registered email address")
                        .setRequired(true)
                )
        )
        .addSubcommand(s =>
            s.setName("info")
                .setDescription("View your account information")
        ),
    category: "RPG",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                already_in_use: "This email or username is already taken",
                invalid_code: "Invalid verification code. Please check and try again",
                invalid_email: "Please provide a valid email address",
                invalid_username: "Username must be 3-20 characters, alphanumeric only",
                password_too_short: "Password must be at least 8 characters long",
                password_timeout: "Password setup timed out. Please try registering again",
                account_not_found: "No unverified account found with this email",
                already_verified: "This account is already verified",
                no_account: "You don't have a registered account yet",
                cooldown: "Please wait before requesting another verification code"
            },
            success: {
                registered: "Account registered successfully!",
                verified: "Your account has been verified successfully!",
                resent: "Verification code has been resent to your email"
            },
            common: {
                email_sent: "Check your email for the verification code",
                ask_password: "Check your DMs to set your password securely",
                dm_ask_password: "Please enter a secure password (minimum 8 characters, include letters and numbers)",
                password_requirements: "Your password should contain:\n• At least 8 characters\n• Letters and numbers\n• Special characters recommended"
            },
            titles: {
                registration_success: "🎉 Registration Complete",
                verification_success: "✅ Account Verified",
                account_info: "📋 Account Information",
                password_setup: "🔐 Password Setup"
            }
        };
        
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }

        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case "new": {
                const username = interaction.options.getString("username", true).trim();
                const email = interaction.options.getString("email", true).trim().toLowerCase();

                if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
                    return utils.safeInteractionRespond(interaction, `❌ ${texts.errors.invalid_username}`);
                }

                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    return utils.safeInteractionRespond(interaction, `❌ ${texts.errors.invalid_email}`);
                }

                const found: any = await db.query(
                    "SELECT * FROM registered_accounts WHERE email = ? OR username = ?",
                    [email, username]
                );

                if (found.length > 0) {
                    const existing = found[0];
                    if (existing.verified) {
                        return utils.safeInteractionRespond(interaction, `❌ ${texts.errors.already_in_use}`);
                    } else {
                        const timeSince = Date.now() - existing.created_at;
                        if (timeSince < 300000) {
                            return utils.safeInteractionRespond(interaction, `❌ ${texts.errors.already_in_use}\n\n*Hint: If this is your account and you haven't verified it yet, use \`/register resend\`*`);
                        }
                    }
                }

                const verification_code = Math.floor(100000 + Math.random() * 900000);

                const passwordSetupEmbed = new EmbedBuilder()
                    .setColor("#3498DB")
                    .setTitle(texts.titles.password_setup)
                    .setDescription(texts.common.ask_password)
                    .addFields(
                        { name: "📧 Email", value: email, inline: true },
                        { name: "👤 Username", value: username, inline: true }
                    )
                    .setFooter({ text: "You have 2 minutes to set your password" })
                    .setTimestamp();

                await utils.safeInteractionRespond(interaction, { embeds: [passwordSetupEmbed] });

                try {
                    const dmEmbed = new EmbedBuilder()
                        .setColor("#9B59B6")
                        .setTitle("🔐 Set Your Password")
                        .setDescription(texts.common.dm_ask_password)
                        .addFields({
                            name: texts.common.password_requirements,
                            value: "\u200b"
                        })
                        .setFooter({ text: "Reply to this message with your password • Expires in 2 minutes" })
                        .setTimestamp();

                    await interaction.user.send({ embeds: [dmEmbed] });
                } catch (error) {
                    return interaction.followUp({ 
                        content: "❌ I couldn't send you a DM. Please enable DMs from server members and try again.",
                        ephemeral: true 
                    });
                }

                const password: string = await new Promise((resolve, reject) => {
                    const collector = interaction.user.dmChannel?.createMessageCollector({ 
                        filter: m => m.author.id === interaction.user.id, 
                        time: 120000,
                        max: 1
                    });

                    collector?.on("collect", async (m) => {
                        const pwd = m.content.trim();
                        
                        if (pwd.length < 8) {
                            await m.reply(`❌ ${texts.errors.password_too_short}`);
                            reject(new Error("Password too short"));
                            return;
                        }

                        if (!/[a-zA-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
                            await m.reply("❌ Password must contain both letters and numbers!");
                            reject(new Error("Weak password"));
                            return;
                        }

                        await m.react("✅");
                        await m.reply("✅ Password set securely! Deleting your message in 5 seconds...");
                        
                        setTimeout(async () => {
                            try {
                                await m.delete();
                            } catch {}
                        }, 5000);

                        resolve(pwd);
                    });

                    collector?.on("end", (collected) => {
                        if (collected.size === 0) {
                            reject(new Error("Timeout"));
                        }
                    });
                });

                if (!password) {
                    return interaction.followUp({ 
                        content: `⏱️ ${texts.errors.password_timeout}`,
                        ephemeral: true 
                    });
                }

                const token = Buffer.from(`${email}:${Date.now()}:${Math.random()}`).toString("base64");
                
                await db.query(
                    "INSERT INTO registered_accounts SET ? ON DUPLICATE KEY UPDATE password = VALUES(password), verification_code = VALUES(verification_code), created_at = VALUES(created_at), token = VALUES(token), verified = FALSE",
                    [{
                        uid: interaction.user.id,
                        email,
                        username,
                        password: utils.encryptWithAES(data.bot.encryption_key, password),
                        verification_code,
                        created_at: Date.now(),
                        token,
                        verified: false,
                        verified_at: 0
                    }]
                );

                const emailHtml = fs.readFileSync("./verification_placeholder.html", "utf-8")
                    .replace("{code}", verification_code.toString())
                    .replace("{username}", username);

                await utils.sendEmail(email, "RPG Account Verification", "", emailHtml);

                const successEmbed = new EmbedBuilder()
                    .setColor("#2ECC71")
                    .setTitle(texts.titles.registration_success)
                    .setDescription(texts.success.registered)
                    .addFields(
                        { name: "👤 Username", value: username, inline: true },
                        { name: "📧 Email", value: email, inline: true },
                        { name: "\u200b", value: "\u200b", inline: true },
                        { 
                            name: "📬 Next Step", 
                            value: `${texts.common.email_sent}\n\nUse \`/register verify <code>\` to complete registration`,
                            inline: false 
                        }
                    )
                    .setFooter({ text: "Check your spam folder if you don't see the email" })
                    .setTimestamp();

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId("verify_help")
                            .setLabel("Need Help?")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji("❓")
                    );

                await interaction.followUp({ embeds: [successEmbed], components: [row], ephemeral: true });

                try {
                    await interaction.user.send({
                        embeds: [new EmbedBuilder()
                            .setColor("#F39C12")
                            .setTitle("📧 Verification Email Sent")
                            .setDescription(`Check your inbox at **${email}** for your verification code!`)
                            .addFields({
                                name: "Didn't receive it?",
                                value: "• Check spam/junk folder\n• Wait 5-10 minutes\n• Use `/register resend` if needed"
                            })
                        ]
                    });
                } catch {}

                break;
            }

            case "verify": {
                const code = interaction.options.getString("code", true).trim();

                if (!/^\d{6}$/.test(code)) {
                    return utils.safeInteractionRespond(interaction, `❌ ${texts.errors.invalid_code}`);
                }

                const account: any = await db.query(
                    "SELECT * FROM registered_accounts WHERE verification_code = ? AND verified = FALSE",
                    [code]
                );

                if (account.length < 1) {
                    return utils.safeInteractionRespond(interaction, `❌ ${texts.errors.invalid_code}`);
                }

                const acc = account[0];

                await db.query(
                    "UPDATE registered_accounts SET verified = TRUE, verified_at = ?, verification_code = '0' WHERE id = ?",
                    [Date.now(), acc.id]
                );

                const verifyEmbed = new EmbedBuilder()
                    .setColor("#2ECC71")
                    .setTitle(texts.titles.verification_success)
                    .setDescription(`🎉 Welcome, **${acc.username}**!`)
                    .addFields(
                        { name: "✅ Account Status", value: "Verified", inline: true },
                        { name: "🆔 Account ID", value: `#${acc.id}`, inline: true },
                        { name: "\u200b", value: "\u200b", inline: true },
                        { 
                            name: "🎮 Next Steps", 
                            value: "• Use `/login` to access your account\n• Use `/rpg create` to start your adventure\n• Explore the RPG world!",
                            inline: false 
                        }
                    )
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .setFooter({ text: "Your adventure begins now!" })
                    .setTimestamp();

                return utils.safeInteractionRespond(interaction, { embeds: [verifyEmbed] });
            }

            case "resend": {
                const email = interaction.options.getString("email", true).trim().toLowerCase();

                const account: any = await db.query(
                    "SELECT * FROM registered_accounts WHERE email = ? AND verified = FALSE",
                    [email]
                );

                if (account.length < 1) {
                    return utils.safeInteractionRespond(interaction, `❌ ${texts.errors.account_not_found}`);
                }

                const acc = account[0];
                const timeSince = Date.now() - acc.created_at;

                if (timeSince < 60000) {
                    return utils.safeInteractionRespond(interaction, `❌ ${texts.errors.cooldown}`);
                }

                const new_code = Math.floor(100000 + Math.random() * 900000);

                await db.query(
                    "UPDATE registered_accounts SET verification_code = ?, created_at = ? WHERE id = ?",
                    [new_code, Date.now(), acc.id]
                );

                const emailHtml = fs.readFileSync("./verification_placeholder.html", "utf-8")
                    .replace("{code}", new_code.toString())
                    .replace("{username}", acc.username);

                await utils.sendEmail(email, "RPG Account Verification (Resent)", "", emailHtml);

                const resendEmbed = new EmbedBuilder()
                    .setColor("#3498DB")
                    .setTitle("📧 Verification Code Resent")
                    .setDescription(texts.success.resent)
                    .addFields(
                        { name: "📧 Email", value: email, inline: true },
                        { name: "👤 Username", value: acc.username, inline: true }
                    )
                    .setFooter({ text: "Check your spam folder if you don't see it" })
                    .setTimestamp();

                return utils.safeInteractionRespond(interaction, { embeds: [resendEmbed] });
            }

            case "info": {
                const account: any = await db.query(
                    "SELECT * FROM registered_accounts WHERE uid = ?",
                    [interaction.user.id]
                );

                if (account.length < 1) {
                    return utils.safeInteractionRespond(interaction, `❌ ${texts.errors.no_account}\n\nUse \`/register new\` to create an account!`);
                }

                const acc = account[0];
                const character: any = await db.query(
                    "SELECT * FROM rpg_characters WHERE account_id = ?",
                    [acc.id]
                );

                const infoEmbed = new EmbedBuilder()
                    .setColor("#9B59B6")
                    .setTitle(texts.titles.account_info)
                    .setDescription(`Account details for **${acc.username}**`)
                    .addFields(
                        { name: "🆔 Account ID", value: `#${acc.id}`, inline: true },
                        { name: "👤 Username", value: acc.username, inline: true },
                        { name: "📧 Email", value: acc.email, inline: true },
                        { name: "✅ Verified", value: acc.verified ? "Yes" : "No", inline: true },
                        { name: "📅 Created", value: `<t:${Math.floor(acc.created_at / 1000)}:R>`, inline: true },
                        { name: "🎮 Character", value: character.length > 0 ? character[0].name : "Not created", inline: true }
                    )
                    .setThumbnail(interaction.user.displayAvatarURL())
                    .setFooter({ text: `Last login: ${acc.last_login ? new Date(acc.last_login).toLocaleString() : "Never"}` })
                    .setTimestamp();

                if (acc.last_login) {
                    infoEmbed.addFields({
                        name: "🕒 Last Login",
                        value: `<t:${Math.floor(acc.last_login / 1000)}:R>`,
                        inline: true
                    });
                }

                return utils.safeInteractionRespond(interaction, { embeds: [infoEmbed] });
            }
        }
    },
    ephemeral: true
};