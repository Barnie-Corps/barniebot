import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import type { GlobalWarning } from "../types/interfaces";

export default {
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warning history for a user")
    .addUserOption(o => o.setName("user").setDescription("User to check (leave empty for yourself)").setRequired(false))
    .addBooleanOption(o => o.setName("include_expired").setDescription("Include expired warnings").setRequired(false)),
  category: "Moderation",
  execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
    const targetUser = interaction.options.getUser("user") ?? interaction.user;
    const includeExpired = interaction.options.getBoolean("include_expired") ?? false;
    const isStaff = (await utils.getUserStaffRank(interaction.user.id)) !== null;
    const isSelf = targetUser.id === interaction.user.id;

    if (!isSelf && !isStaff) {
      let selfOnly = "You can only view your own warnings.";
      if (lang !== "en") {
        selfOnly = (await utils.translate(selfOnly, "en", lang).catch(() => ({ text: selfOnly }))).text;
      }
      return utils.safeInteractionRespond(interaction, selfOnly);
    }

    const now = Date.now();
    let query = "SELECT * FROM global_warnings WHERE userid = ?";
    const params: (string | number)[] = [targetUser.id];

    if (!includeExpired) {
      query += " AND active = TRUE AND expires_at > ?";
      params.push(now);
    }

    query += " ORDER BY createdAt DESC";

    const warnings = await db.query(query, params) as unknown as GlobalWarning[];

    const activeWarnings = warnings.filter((w: GlobalWarning) =>
      w.active &&
      w.expires_at > now &&
      (!w.appeal_status || w.appeal_status !== "approved")
    );
    const totalPoints = activeWarnings.reduce((sum: number, w: GlobalWarning) => sum + (w.points || 1), 0);

    let texts = {
      noWarnings: `${targetUser.username} has no ${includeExpired ? "" : "active "}warnings.`,
      title: `⚠️ Warning History - ${targetUser.username}`,
      description: `Total Active Points: **${totalPoints}** / 5\n${warnings.length} warning(s) found`,
      appealed: " [APPEALED]",
      expired: " [EXPIRED]",
      inactive: " [INACTIVE]",
      reason: "**Reason:**",
      points: "**Points:**",
      category: "**Category:**",
      issued: "**Issued:**",
      expires: "**Expires:**",
      appealPending: "**Appeal:** Pending review",
      appealApproved: "**Appeal:** Approved by staff",
      issuedBy: "**Issued by:**",
      showingSome: `Showing 10 of ${warnings.length} warnings. Use filters to see more.`,
      warning3Title: "⚠️ Warning",
      warning3Value: "You have 3+ points. One more warning may result in automatic muting or blacklisting.",
      criticalTitle: "🚨 Critical",
      criticalValue: "You have 5+ points. Further violations will result in automatic blacklisting.",
      tipTitle: "💡 Tip",
      tipValue: "You can appeal warnings using `/appeal <warning_id> <reason>`"
    };
    if (lang !== "en") {
      texts = await utils.autoTranslate(texts, "en", lang).catch(() => texts);
    }

    if (warnings.length === 0) {
      return utils.safeInteractionRespond(interaction, texts.noWarnings);
    }

    const embed = new EmbedBuilder()
      .setColor(totalPoints >= 5 ? "Red" : totalPoints >= 3 ? "Orange" : "Yellow")
      .setTitle(texts.title)
      .setDescription(texts.description)
      .setTimestamp();

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

    const displayWarnings = warnings.slice(0, 10);

    for (const warning of displayWarnings) {
      const emoji = categoryEmojis[warning.category] || "⚠️";
      const isExpired = warning.expires_at <= now;
      const isAppealed = warning.appealed && warning.appeal_status === "approved";
      const isInactive = !warning.active;

      let statusText = "";
      if (isAppealed) statusText = texts.appealed;
      else if (isExpired) statusText = texts.expired;
      else if (isInactive) statusText = texts.inactive;

      const pointsText = warning.points === 1 ? "1 pt" : `${warning.points} pts`;

      let fieldValue = `${texts.reason} ${warning.reason}\n`;
      fieldValue += `${texts.points} ${pointsText} | ${texts.category} ${warning.category}\n`;
      fieldValue += `${texts.issued} <t:${Math.floor(warning.createdAt / 1000)}:R>\n`;
      fieldValue += `${texts.expires} <t:${Math.floor(warning.expires_at / 1000)}:R>`;

      if (warning.appealed && warning.appeal_status === "pending") {
        fieldValue += `\n${texts.appealPending}`;
      } else if (isAppealed) {
        fieldValue += `\n${texts.appealApproved}`;
      }

      if (isStaff) {
        try {
          const author = await interaction.client.users.fetch(warning.authorid);
          fieldValue += `\n${texts.issuedBy} ${author.username}`;
        } catch { }
      }

      embed.addFields({
        name: `${emoji} Warning #${warning.id}${statusText}`,
        value: fieldValue,
        inline: false
      });
    }

    if (warnings.length > 10) {
      embed.setFooter({ text: texts.showingSome });
    }

    if (totalPoints >= 3 && totalPoints < 5) {
      embed.addFields({
        name: texts.warning3Title,
        value: texts.warning3Value,
        inline: false
      });
    } else if (totalPoints >= 5) {
      embed.addFields({
        name: texts.criticalTitle,
        value: texts.criticalValue,
        inline: false
      });
    }

    if (isSelf && totalPoints > 0) {
      embed.addFields({
        name: texts.tipTitle,
        value: texts.tipValue,
        inline: false
      });
    }

    return utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
  },
  ephemeral: true
};