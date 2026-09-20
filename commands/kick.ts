import { ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kicks a user from the server")
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(o => o.setName("user").setDescription("The target user.").setRequired(true)),
    category: "Moderation",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        if (!interaction.guild) return await utils.safeInteractionRespond(interaction, "No.");
        await interaction.deferReply({ ephemeral: true });
        await interaction.guild?.members.fetch();
        const user = interaction.options.getUser('user');
        if (!user) {
            await utils.safeInteractionRespond(interaction, 'User not found');
            return;
        }
        const member = interaction.guild?.members.cache.get(user.id);
        if (!member) {
            await utils.safeInteractionRespond(interaction, 'Member not found');
            return;
        }
        const executorRank = await utils.getUserStaffRank(interaction.user.id);
        const targetRank = await utils.getUserStaffRank(user.id);
        if (targetRank) {
            if (!executorRank) {
                await utils.safeInteractionRespond(interaction, "You cannot kick a staff member.");
                return;
            }
            if (utils.getStaffRankIndex(targetRank) >= utils.getStaffRankIndex(executorRank)) {
                await utils.safeInteractionRespond(interaction, "You cannot kick someone of equal or higher staff rank.");
                return;
            }
        }
        try {
            await member.kick();
            await utils.safeInteractionRespond(interaction, ':white_check_mark:');
        } catch (error) {
            await utils.safeInteractionRespond(interaction, ':x:');
        }
    },
    ephemeral: false
}