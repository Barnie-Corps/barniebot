import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";

export default {
    data: new SlashCommandBuilder()
        .setName("remindme")
        .setDescription("Set a reminder")
        .addStringOption(o => o.setName("time").setDescription("When to remind you (e.g. 30m, 2h, 1d)").setRequired(true))
        .addStringOption(o => o.setName("message").setDescription("What to remind you about").setRequired(true)),
    category: "Utility",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let texts = {
            invalid_time: "Invalid time format. Use e.g. `30m`, `2h`, `1d`, `5m30s`.",
            time_too_short: "Minimum reminder time is 30 seconds.",
            time_too_long: "Maximum reminder time is 30 days.",
            created: "Reminder set! I'll remind you",
            title: "⏰ Reminder",
            from_now: "from now",
            at_time: "at"
        };
        if (lang !== "en") {
            try { texts = await utils.autoTranslate(texts, "en", lang); } catch {}
        }
        const timeStr = interaction.options.getString("time", true);
        const message = interaction.options.getString("message", true);
        const ms = utils.parseDurationString(timeStr);
        if (!ms || ms < 0) {
            return utils.safeInteractionRespond(interaction, { content: texts.invalid_time, ephemeral: true });
        }
        if (ms < 30000) {
            return utils.safeInteractionRespond(interaction, { content: texts.time_too_short, ephemeral: true });
        }
        if (ms > 2592000000) {
            return utils.safeInteractionRespond(interaction, { content: texts.time_too_long, ephemeral: true });
        }
        const now = Date.now();
        const remindAt = now + ms;
        await db.query("INSERT INTO reminders SET ?", [{
            user_id: interaction.user.id,
            channel_id: interaction.channelId,
            message,
            remind_at: remindAt,
            created_at: now,
            status: "pending"
        }]);
        const embed = new EmbedBuilder()
            .setColor("Blue")
            .setTitle(texts.title)
            .setDescription(`${texts.created} ${timeStr} ${texts.from_now}\n> ${message}`)
            .setTimestamp(new Date(remindAt));
        await utils.safeInteractionRespond(interaction, { embeds: [embed], ephemeral: true });
    },
    ephemeral: true
};
