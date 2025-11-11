import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder, User, TimestampStyles, time } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
export default {
    data: new SlashCommandBuilder()
        .setName("userinfo")
        .setDescription("Get information about a user")
        .addUserOption(option =>
            option.setName("user")
                .setDescription("The user to get information about")
                .setRequired(true)
        ),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            common: {
                created_at: "Created at",
                joined_at: "Joined the server at",
                roles: "Roles",
                permissions: "Permissions",
                messages_sent: "Messages sent",
                global_messages: "Global messages sent",
            }
        }
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        const user = interaction.options.getUser("user") as User;
        const member = interaction.guild?.members.cache.get(user.id);
        const allMessageCount: any = await db.query("SELECT * FROM message_count WHERE uid = ?", [user.id]);
        const globalChatCount: any = await db.query("SELECT * FROM global_messages WHERE uid = ?", [user.id]);
        const embed = new EmbedBuilder()
            .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
            .addFields(
                {
                    name: "ID",
                    value: user.id,
                    inline: true
                },
                {
                    name: "Bot",
                    value: user.bot ? "Yes" : "No",
                    inline: true
                },
                {
                    name: texts.common.created_at,
                    value: `${time(Math.round((user.createdTimestamp as number) / 1000), TimestampStyles.ShortDateTime)} (${time(Math.round((user.createdTimestamp as number) / 1000), TimestampStyles.RelativeTime)})`,
                    inline: true
                },
                {
                    name: texts.common.joined_at,
                    value: member ? `${time(Math.round((member.joinedTimestamp as number) / 1000), TimestampStyles.ShortDateTime)} (${time(Math.round((member.joinedTimestamp as number) / 1000), TimestampStyles.RelativeTime)})` : "Not in the server",
                    inline: true
                },
                {
                    name: texts.common.roles,
                    value: member ? member.roles.cache.map(r => r.toString()).join(", ") : "Not in the server",
                    inline: true
                },
                {
                    name: texts.common.messages_sent,
                    value: allMessageCount[0] ? allMessageCount[0].count.toLocaleString() : "-----//-----",
                    inline: true
                },
                {
                    name: texts.common.global_messages,
                    value: globalChatCount[0] ? globalChatCount.length.toLocaleString() : "-----//-----",
                    inline: true
                },
                {
                    name: texts.common.permissions,
                    value: member ? member.permissions.toArray().join(", ") : "Not in the server",
                    inline: false
                },
            )
            .setColor("Purple")
            .setTimestamp()
        await interaction.editReply({ embeds: [embed], content: "" });
    }
}