import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import db from "../mysql/database";
import { manager } from "..";
import utils from "../utils";

export default {
  data: new SlashCommandBuilder()
    .setName("appeal")
    .setDescription("Appeal a warning")
    .addIntegerOption(o => o.setName("warning_id").setDescription("Warning ID to appeal").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Why should this warning be removed?").setRequired(true).setMinLength(20).setMaxLength(500)),
  category: "Moderation",
  execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
    const warningId = interaction.options.getInteger("warning_id", true);
    const appealReason = interaction.options.getString("reason", true);
    const user = interaction.user;

    // Check if warning exists and belongs to the user
    const warningData: any = await db.query("SELECT * FROM global_warnings WHERE id = ? AND userid = ?", [warningId, user.id]);

    if (!warningData[0]) {
      return utils.safeInteractionRespond(interaction, `Warning #${warningId} not found or doesn't belong to you.`);
    }

    const warning = warningData[0];

    // Check if already appealed
    if (warning.appealed) {
      if (warning.appeal_status === "pending") {
        return utils.safeInteractionRespond(interaction, `Warning #${warningId} has already been appealed and is pending review.`);
      } else if (warning.appeal_status === "approved") {
        return utils.safeInteractionRespond(interaction, `Warning #${warningId} has already been appealed and was approved.`);
      } else if (warning.appeal_status === "denied") {
        return utils.safeInteractionRespond(interaction, `Warning #${warningId} has already been appealed and was denied. Appeals cannot be resubmitted.`);
      }
    }

    // Check if warning is expired
    if (warning.expires_at <= Date.now()) {
      return utils.safeInteractionRespond(interaction, `Warning #${warningId} has already expired and doesn't need to be appealed.`);
    }

    // Check if warning is inactive
    if (!warning.active) {
      return utils.safeInteractionRespond(interaction, `Warning #${warningId} is already inactive.`);
    }

    // Update warning with appeal
    await db.query(
      "UPDATE global_warnings SET appealed = TRUE, appeal_status = 'pending', appeal_reason = ? WHERE id = ?",
      [appealReason, warningId]
    );

    // Notify staff via global chat
    const categoryEmojis: Record<string, string> = {
      spam: "📧",
      harassment: "😡",
      nsfw: "🔞",
      hate_speech: "🚫",
      impersonation: "🎭",
      advertising: "📢",
      doxxing: "🔍",
      raiding: "⚔️",
      disrespect: "😤",
      general: "⚠️"
    };

    const emoji = categoryEmojis[warning.category] || "⚠️";
    const pointsText = warning.points === 1 ? "1 point" : `${warning.points} points`;

    let staffNotification = `📋 **New Warning Appeal** #${warningId}\n\n`;
    staffNotification += `**User:** ${user.username} (${user.id})\n`;
    staffNotification += `**Original Warning:**\n`;
    staffNotification += `${emoji} ${warning.category} - ${pointsText}\n`;
    staffNotification += `Reason: ${warning.reason}\n`;
    staffNotification += `Issued: <t:${Math.floor(warning.createdAt / 1000)}:R>\n\n`;
    staffNotification += `**Appeal Reason:**\n${appealReason}\n\n`;
    staffNotification += `Staff can review this appeal using \`/stafftools reviewappeals\``;

    await manager.announce(staffNotification, "en");

    // Send confirmation to user
    const confirmEmbed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle("📋 Appeal Submitted")
      .setDescription(`Your appeal for warning #${warningId} has been submitted and is pending staff review.`)
      .addFields(
        { name: "Original Warning", value: `${emoji} ${warning.category} - ${pointsText}\n${warning.reason}` },
        { name: "Your Appeal", value: appealReason },
        { name: "What's Next?", value: "Staff will review your appeal and make a decision. You'll be notified of the outcome." }
      )
      .setFooter({ text: "Please be patient while staff reviews your appeal." })
      .setTimestamp();

    return utils.safeInteractionRespond(interaction, { embeds: [confirmEmbed] });
  },
  ephemeral: true
};
