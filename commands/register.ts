import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import data from "../data";
import * as fs from "fs";

export default {
    data: new SlashCommandBuilder()
        .setName("register")
        .setDescription("Register or verifies a new account in the bot's RPG system.")
        .addSubcommand(s =>
            s.setName("new")
                .setDescription("Register a new account in the bot's RPG system.")
                .addStringOption(option =>
                    option.setName("email")
                        .setDescription("Your email")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName("username")
                        .setDescription("Your username")
                        .setRequired(true)
                )
        )
        .addSubcommand(s =>
            s.setName("verify")
                .setDescription("Verify your account with the code sent to your email")
                .addStringOption(option =>
                    option.setName("code")
                        .setDescription("The code sent to your email")
                        .setRequired(true)
                )
        ),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                already_in_use: "This email or username is already in use",
                invalid_code: "The code you provided is invalid",
            },
            success: {
                registered: "Great! I've registered your account, although you need to verify it with the code sent to your email using the command `/register verify`",
                verified: "Your account has been verified"
            },
            common: {
                email_sent: "I've sent you an email with a verification code, when you get it, use the command `/register verify`",
                ask_password: "Please, check your private messages to set your password",
                dm_ask_password: "Please, set your password",
            }
        }
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        const username = interaction.options.getString("username") as string;
        const email = interaction.options.getString("email") as string;
        switch (interaction.options.getSubcommand()) {
            case "new": {
                const found: any = db.query("SELECT * FROM registered_accounts WHERE email = ? OR username = ?", [email, username]);
                if (found.length > 0) {
                    return interaction.editReply(texts.errors.already_in_use);
                }
                const verification_code = Math.floor(Math.random() * 1000000);
                const password: string = await (async function () {
                    await interaction.editReply(texts.common.ask_password);
                    await interaction.user.send(texts.common.dm_ask_password);
                    return new Promise((resolve) => {
                        const collector = interaction.user.dmChannel?.createMessageCollector({ filter: m => m.author.id === interaction.user.id, time: 60000 });
                        collector?.on("collect", async (m) => {
                            collector.stop();
                            resolve(m.content);
                        });
                    });
                })();
                // Creating token with a base64 encoded string of the email and the current time [TOKEN IS NOT SECURE SINCE IT IS USED FOR NON-SENSITIVE DATA]
                const token = Buffer.from(`${email}:${Date.now()}`).toString("base64");
                await db.query("INSERT INTO registered_accounts SET ?", [{ email, username, password: utils.encryptWithAES(data.bot.encryption_key, password), verification_code, created_at: Date.now(), token }]);
                await utils.sendEmail(email, "Verification code", "", fs.readFileSync("./verification_placeholder.html", "utf-8").replace("{code}", verification_code.toString()).replace("{username}", username));
                await interaction.user.send(texts.common.email_sent);
                break;
            }
            case "verify": {
                const code = interaction.options.getString("code") as string;
                const found: any = await db.query("SELECT * FROM registered_accounts WHERE verification_code = ?", [code]);
                if (found.length < 1 || code === "0") {
                    return interaction.editReply(texts.errors.invalid_code);
                }
                await db.query("UPDATE registered_accounts SET verified = TRUE, verified_at = ? WHERE verification_code = ?", [Date.now(), code]);
                await interaction.editReply(texts.success.verified);
                break;
            }
        }
    },
    ephemeral: true
};