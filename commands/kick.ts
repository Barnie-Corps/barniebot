import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kicks a user from the server")
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(o => o.setName("user").setDescription("The target user.").setRequired(true)),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        if (!interaction.guild) return await interaction.reply("No.");
        await interaction.deferReply({ ephemeral: true });
        await interaction.guild?.members.fetch();
        const user = interaction.options.getUser('user');
        if (!user) {
            await interaction.editReply('User not found');
            return;
        }
        const member = interaction.guild?.members.cache.get(user.id);
        if (!member) {
            await interaction.editReply('Member not found');
            return;
        }
        try {
            await member.kick();
            await interaction.editReply(':white_check_mark:');
        } catch (error) {
            await interaction.editReply(':x:');
        }
    },
    ephemeral: false
}