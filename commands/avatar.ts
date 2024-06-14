import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Shows the avatar of an specified user or the author if none specified.")
    .addUserOption(o => o.setName("target").setDescription("Target whose avatar u wanna see (don't specify if you want to see ur own avatar)").setRequired(false)),
    async execute (interaction: ChatInputCommandInteraction) {
        let target = interaction.options.getUser("target");
        if (!target) target = interaction.user;
        const embed = new EmbedBuilder()
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(target.username)
        .setImage(target.displayAvatarURL({ size: 1024 }))
        .setColor("Purple")
        await interaction.editReply({ embeds: [embed], content: "" });
    },
    ephemeral: false
}