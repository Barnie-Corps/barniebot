import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";

export default {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warning history for a user")
    .addUserOption(o => o.setName("user").setDescription("User to check (leave empty for yourself)").setRequired(false))
    .addBooleanOption(o => o.setName("include_expired").setDescription("Include expired warnings").setRequired(false)),
  execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    const includeExpired = interaction.options.getBoolean("include_expired") ?? false;
    const isStaff = (await utils.getUserStaffRank(interaction.user.id)) !== null;
    const isSelf = targetUser.id === interaction.user.id;

    // Only staff can view other users' warnings
    if (!isSelf && !isStaff) {
      return interaction.editReply("You can only view your own warnings.");
    }

    const now = Date.now();
    let query = "SELECT * FROM global_warnings WHERE userid = ?";
    const params: any[] = [targetUser.id];

    if (!includeExpired) {
      query += " AND active = TRUE AND expires_at > ?";
      params.push(now);
    }

    query += " ORDER BY createdAt DESC";

    const warnings: any = await db.query(query, params);

    if (warnings.length === 0) {
      return interaction.editReply(`${targetUser.username} has no ${includeExpired ? "" : "active "}warnings.`);
    }

    // Calculate total active points
    const activeWarnings = warnings.filter((w: any) =>
      w.active &&
      w.expires_at > now &&
      (!w.appeal_status || w.appeal_status !== "approved")
    );
    const totalPoints = activeWarnings.reduce((sum: number, w: any) => sum + (w.points || 1), 0);

    const embed = new EmbedBuilder()
      .setColor(totalPoints >= 5 ? "Red" : totalPoints >= 3 ? "Orange" : "Yellow")
      .setTitle(`⚠️ Warning History - ${targetUser.username}`)
      .setDescription(`Total Active Points: **${totalPoints}** / 5\n${warnings.length} warning(s) found`)
      .setTimestamp();

    // Category emoji mapping
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

    // Show up to 10 most recent warnings
    const displayWarnings = warnings.slice(0, 10);

    for (const warning of displayWarnings) {
      const emoji = categoryEmojis[warning.category] || "⚠️";
      const isExpired = warning.expires_at <= now;
      const isAppealed = warning.appealed && warning.appeal_status === "approved";
      const isInactive = !warning.active;

      let statusText = "";
      if (isAppealed) statusText = " [APPEALED]";
      else if (isExpired) statusText = " [EXPIRED]";
      else if (isInactive) statusText = " [INACTIVE]";

      const pointsText = warning.points === 1 ? "1 pt" : `${warning.points} pts`;

      let fieldValue = `**Reason:** ${warning.reason}\n`;
      fieldValue += `**Points:** ${pointsText} | **Category:** ${warning.category}\n`;
      fieldValue += `**Issued:** <t:${Math.floor(warning.createdAt / 1000)}:R>\n`;
      fieldValue += `**Expires:** <t:${Math.floor(warning.expires_at / 1000)}:R>`;

      if (warning.appealed && warning.appeal_status === "pending") {
        fieldValue += `\n**Appeal:** Pending review`;
      } else if (isAppealed) {
        fieldValue += `\n**Appeal:** Approved by staff`;
      }

      // Only show staff info to other staff
      if (isStaff) {
        try {
          const author = await interaction.client.users.fetch(warning.authorid);
          fieldValue += `\n**Issued by:** ${author.username}`;
        } catch { }
      }

      embed.addFields({
        name: `${emoji} Warning #${warning.id}${statusText}`,
        value: fieldValue,
        inline: false
      });
    }

    if (warnings.length > 10) {
      embed.setFooter({ text: `Showing 10 of ${warnings.length} warnings. Use filters to see more.` });
    }

    // Add escalation warning
    if (totalPoints >= 3 && totalPoints < 5) {
      embed.addFields({
        name: "⚠️ Warning",
        value: "You have 3+ points. One more warning may result in automatic muting or blacklisting.",
        inline: false
      });
    } else if (totalPoints >= 5) {
      embed.addFields({
        name: "🚨 Critical",
        value: "You have 5+ points. Further violations will result in automatic blacklisting.",
        inline: false
      });
    }

    if (isSelf && totalPoints > 0) {
      embed.addFields({
        name: "💡 Tip",
        value: "You can appeal warnings using `/appeal <warning_id> <reason>`",
        inline: false
      });
    }

    return interaction.editReply({ embeds: [embed], content: "" });
  },
  ephemeral: true
};
