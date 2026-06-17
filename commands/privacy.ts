import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("privacy")
        .setDescription("Shows you the bot privacy policy and data handling information."),
    category: "Info",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        // Create comprehensive privacy information embed
        const embed = new EmbedBuilder()
            .setTitle("🔒 BarnieBot Privacy & Data Policy")
            .setColor(0x5865F2)
            .setDescription("We take your privacy seriously. This bot collects and processes data to provide services.")
            .addFields(
                {
                    name: "📋 What Data We Collect",
                    value: "• Discord IDs, usernames, avatars\n• Command usage and timestamps\n• Global chat messages (encrypted)\n• RPG accounts (encrypted passwords)\n• Support ticket transcripts\n• Moderation logs and warnings",
                    inline: false
                },
                {
                    name: "🔐 How We Protect Data",
                    value: "• AES-256-CBC encryption for sensitive data\n• TLS/HTTPS for all external APIs\n• Parameterized SQL queries\n• Access controls and audit logging\n• Regular security updates",
                    inline: false
                },
                {
                    name: "🗄️ Data Retention",
                    value: "• Audit logs: Indefinite (accountability)\n• RPG data: Until you delete account\n• AI sessions: Ephemeral (temporary)\n• Global chat: Encrypted history\n• You can request deletion anytime",
                    inline: false
                },
                {
                    name: "👥 Third-Party Services",
                    value: "• Google Translate (translation)\n• NVIDIA Riva (voice features)\n• Gmail (verification emails)\n• Discord API (all interactions)",
                    inline: false
                },
                {
                    name: "⚖️ Your Rights",
                    value: "• **Access**: Request your data\n• **Rectification**: Correct inaccuracies\n• **Erasure**: Delete your data\n• **Portability**: Export your data\n• **Objection**: Limit processing\n• Admins can use `/data export` and `/data delete`",
                    inline: false
                },
                {
                    name: "📧 Contact for Privacy Requests",
                    value: "Email: barniecorps@gmail.com\nResponse time: Within 30 days",
                    inline: false
                }
            )
            .setFooter({ 
                text: "Last Updated: November 26, 2025 • Click links below for full policies" 
            })
            .setTimestamp();

        if (lang !== "en") {
            const translated = await utils.autoTranslate(
                { value: "View our comprehensive privacy policy and usage terms for complete details about data handling, security measures, and your rights." },
                "en",
                lang
            );
            
            await utils.safeInteractionRespond(interaction, {
                content: translated.value,
                embeds: [embed],
                components: [{
                    type: 1,
                    components: [
                        {
                            type: 2,
                            style: 5,
                            label: "Privacy Policy",
                            url: "https://github.com/Barnie-Corps/barniebot/blob/master/privacy.md",
                            emoji: "🔒"
                        },
                        {
                            type: 2,
                            style: 5,
                            label: "Usage Policy",
                            url: "https://github.com/Barnie-Corps/barniebot/blob/master/usage_policy.md",
                            emoji: "📜"
                        },
                        {
                            type: 2,
                            style: 5,
                            label: "Report Issue",
                            url: "https://github.com/Barnie-Corps/barniebot/issues",
                            emoji: "⚠️"
                        }
                    ]
                }]
            });
        } else {
            await utils.safeInteractionRespond(interaction, {
                content: "📋 **View our comprehensive privacy policy and usage terms for complete details about data handling, security measures, and your rights.**",
                embeds: [embed],
                components: [{
                    type: 1,
                    components: [
                        {
                            type: 2,
                            style: 5,
                            label: "Privacy Policy",
                            url: "https://github.com/Barnie-Corps/barniebot/blob/master/privacy.md",
                            emoji: "🔒"
                        },
                        {
                            type: 2,
                            style: 5,
                            label: "Usage Policy",
                            url: "https://github.com/Barnie-Corps/barniebot/blob/master/usage_policy.md",
                            emoji: "📜"
                        },
                        {
                            type: 2,
                            style: 5,
                            label: "Report Issue",
                            url: "https://github.com/Barnie-Corps/barniebot/issues",
                            emoji: "⚠️"
                        }
                    ]
                }]
            });
        }
    },
    ephemeral: false
}