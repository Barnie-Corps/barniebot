import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder, User, TimestampStyles, time } from "discord.js";
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
        const user = interaction.options.getUser("user") as User;
        const member = interaction.guild?.members.cache.get(user.id);
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
                    name: "Created at",
                    value: `${time(Math.round((user.createdTimestamp as number) / 1000), TimestampStyles.ShortDateTime)} (${time(Math.round((user.createdTimestamp as number) / 1000), TimestampStyles.RelativeTime)})`,
                    inline: true
                },
                {
                    name: "Joined at",
                    value: member ? `${time(Math.round((member.joinedTimestamp as number) / 1000), TimestampStyles.ShortDateTime)} (${time(Math.round((member.joinedTimestamp as number) / 1000), TimestampStyles.RelativeTime)})` : "Not in the server",
                    inline: true
                },
                {
                    name: "Roles",
                    value: member ? member.roles.cache.map(r => r.toString()).join(", ") : "Not in the server",
                    inline: true
                },
                {
                    name: "Permissions",
                    value: member ? member.permissions.toArray().join(", ") : "Not in the server",
                    inline: false
                },
            )
            .setColor("Purple")
            .setTimestamp()
        await interaction.editReply({ embeds: [embed], content: "" });
    }
}