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

    let texts = {
      notFound: `Warning #${warningId} not found or doesn't belong to you.`,
      pending: `Warning #${warningId} has already been appealed and is pending review.`,
      approved: `Warning #${warningId} has already been appealed and was approved.`,
      denied: `Warning #${warningId} has already been appealed and was denied. Appeals cannot be resubmitted.`,
      expired: `Warning #${warningId} has already expired and doesn't need to be appealed.`,
      inactive: `Warning #${warningId} is already inactive.`,
      onePoint: "1 point",
      points: `${0} points`,
      submittedTitle: "📋 Appeal Submitted",
      submittedDescription: `Your appeal for warning #${warningId} has been submitted and is pending staff review.`,
      originalWarning: "Original Warning",
      yourAppeal: "Your Appeal",
      whatsNext: "What's Next?",
      whatsNextValue: "Staff will review your appeal and make a decision. You'll be notified of the outcome.",
      footer: "Please be patient while staff reviews your appeal."
    };
    if (lang !== "en") {
      texts = await utils.autoTranslate(texts, "en", lang).catch(() => texts);
    }

    const warningData: any = await db.query("SELECT * FROM global_warnings WHERE id = ? AND userid = ?", [warningId, user.id]);

    if (!warningData[0]) {
      return utils.safeInteractionRespond(interaction, texts.notFound);
    }

    const warning = warningData[0];

    if (warning.appealed) {
      if (warning.appeal_status === "pending") {
        return utils.safeInteractionRespond(interaction, texts.pending);
      } else if (warning.appeal_status === "approved") {
        return utils.safeInteractionRespond(interaction, texts.approved);
      } else if (warning.appeal_status === "denied") {
        return utils.safeInteractionRespond(interaction, texts.denied);
      }
    }

    if (warning.expires_at <= Date.now()) {
      return utils.safeInteractionRespond(interaction, texts.expired);
    }

    if (!warning.active) {
      return utils.safeInteractionRespond(interaction, texts.inactive);
    }

    await db.query(
      "UPDATE global_warnings SET appealed = TRUE, appeal_status = 'pending', appeal_reason = ? WHERE id = ?",
      [appealReason, warningId]
    );

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
    const pointsText = warning.points === 1 ? texts.onePoint : texts.points.replace("0", String(warning.points));

    let staffNotification = `📋 **New Warning Appeal** #${warningId}\n\n`;
    staffNotification += `**User:** ${user.username} (${user.id})\n`;
    staffNotification += `**Original Warning:**\n`;
    staffNotification += `${emoji} ${warning.category} - ${pointsText}\n`;
    staffNotification += `Reason: ${warning.reason}\n`;
    staffNotification += `Issued: <t:${Math.floor(warning.createdAt / 1000)}:R>\n\n`;
    staffNotification += `**Appeal Reason:**\n${appealReason}\n\n`;
    staffNotification += `Staff can review this appeal using \`/stafftools reviewappeals\``;

    await manager.Log(staffNotification);

    const confirmEmbed = new EmbedBuilder()
      .setColor("Blue")
      .setTitle(texts.submittedTitle)
      .setDescription(texts.submittedDescription)
      .addFields(
        { name: texts.originalWarning, value: `${emoji} ${warning.category} - ${pointsText}\n${warning.reason}` },
        { name: texts.yourAppeal, value: appealReason },
        { name: texts.whatsNext, value: texts.whatsNextValue }
      )
      .setFooter({ text: texts.footer })
      .setTimestamp();

    return utils.safeInteractionRespond(interaction, { embeds: [confirmEmbed] });
  },
  ephemeral: true
};
