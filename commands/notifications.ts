import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";

export default {
    data: new SlashCommandBuilder()
        .setName("notifications")
        .setDescription("View your unread notifications"),
    category: "Utility",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        const userId = interaction.user.id;

        const notifications = await utils.getUnreadNotifications(userId);

        if (notifications.length === 0) {
            return interaction.editReply("📭 You don't have any unread notifications!");
        }

        let currentPage = 0;

        const showPage = async (page: number, isUpdate: boolean = false) => {
            const notif = notifications[page];
            if (!notif) return;

            const normalize = (value: any): string => {
                if (value == null) return "";
                if (typeof value === "string") return value;
                if (typeof value === "object" && !Array.isArray(value)) {
                    if (typeof value.text === "string") return value.text;
                    try { return JSON.stringify(value); } catch { return String(value); }
                }
                if (Array.isArray(value)) return value.join(" ");
                return String(value);
            };

            let baseContent = normalize(notif.content).trim();
            if (baseContent.length > 0) {
                baseContent = baseContent.charAt(0).toLowerCase() + baseContent.slice(1);
            }

            let displayContent = baseContent;
            if (lang !== "en" && notif.language !== lang) {
                try {
                    const translated = await utils.translate(baseContent, notif.language, lang);
                    displayContent = normalize(translated.text).trim();
                } catch {
                    displayContent = baseContent;
                }
            }

            const embed = new EmbedBuilder()
                .setColor("Purple")
                .setTitle("📢 New Notification")
                .setDescription(displayContent)
                .setFooter({
                    text: `Notification ${page + 1} of ${notifications.length} • Tap "Mark as Read" to dismiss`,
                    iconURL: interaction.client.user?.displayAvatarURL() || undefined
                })
                .setTimestamp(new Date(notif.created_at));

            const row = new ActionRowBuilder<ButtonBuilder>();

            if (page > 0) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`notif_prev_${page}`)
                        .setLabel("◀ Previous")
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`notif_read_${notif.id}`)
                    .setLabel("Mark as Read")
                    .setStyle(ButtonStyle.Success)
            );

            if (page < notifications.length - 1) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`notif_next_${page}`)
                        .setLabel("Next ▶")
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            if (isUpdate) {
                await interaction.editReply({ embeds: [embed], components: [row], content: "" });
            } else {
                await interaction.editReply({ embeds: [embed], components: [row], content: "" });
            }
        };

        await showPage(currentPage);

        const collector = interaction.channel?.createMessageComponentCollector({
            filter: (i: any) => i.user.id === interaction.user.id && i.customId.startsWith("notif_"),
            time: 300000
        });

        if (collector) {
            collector.on("collect", async (i: any) => {
                const [action, type, value] = i.customId.split("_");

                if (type === "prev") {
                    currentPage = Math.max(0, currentPage - 1);
                    await i.deferUpdate();
                    await showPage(currentPage, true);
                } else if (type === "next") {
                    currentPage = Math.min(notifications.length - 1, currentPage + 1);
                    await i.deferUpdate();
                    await showPage(currentPage, true);
                } else if (type === "read") {
                    const notifId = parseInt(value);
                    await utils.markNotificationRead(interaction.user.id, notifId);

                    notifications.splice(notifications.findIndex(n => n.id === notifId), 1);

                    if (notifications.length === 0) {
                        await i.update({
                            embeds: [new EmbedBuilder()
                                .setColor("Purple")
                                .setDescription("✅ All notifications have been marked as read!")],
                            components: []
                        });
                        collector.stop();
                    } else {
                        if (currentPage >= notifications.length) {
                            currentPage = notifications.length - 1;
                        }
                        await i.deferUpdate();
                        await showPage(currentPage, true);
                    }
                }
            });
        }
    },
    ephemeral: false
};
