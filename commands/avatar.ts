import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("avatar")
        .setDescription("Displays the avatar of a specified user or yourself if none is specified.")
        .addUserOption(option =>
            option
                .setName("target")
                .setDescription("The user whose avatar you wish to view")
                .setRequired(false)
        ),
    async execute(interaction: ChatInputCommandInteraction) {
        const target = interaction.options.getUser("target") ?? interaction.user;

        const embed = new EmbedBuilder()
            .setAuthor({
                name: interaction.user.username,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTitle(`${target.username}'s Avatar`)
            .setImage(target.displayAvatarURL({ size: 1024 }))
            .setColor("Purple")
            .setFooter({ text: `Requested by ${interaction.user.username}` })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], content: "" });
    },
    ephemeral: false
};