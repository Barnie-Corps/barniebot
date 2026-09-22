import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from "discord.js";
import utils from "../utils";
import db from "../mysql/database";

export default {
    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Manage giveaways")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s =>
            s.setName("start")
                .setDescription("Start a new giveaway")
                .addStringOption(o => o.setName("prize").setDescription("The prize to give away").setRequired(true))
                .addStringOption(o => o.setName("duration").setDescription("Duration (e.g. 30m, 2h, 1d)").setRequired(true))
                .addIntegerOption(o => o.setName("winners").setDescription("Number of winners (default 1)").setMinValue(1).setMaxValue(25))
                .addStringOption(o => o.setName("description").setDescription("Description of the giveaway"))
        )
        .addSubcommand(s =>
            s.setName("end")
                .setDescription("End a giveaway early")
                .addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true))
        )
        .addSubcommand(s =>
            s.setName("reroll")
                .setDescription("Reroll a giveaway winner")
                .addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true))
        )
        .addSubcommand(s =>
            s.setName("list")
                .setDescription("List active giveaways in this server")
        ),
    category: "Utility",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        let texts = {
            no_guild: "This command can only be used in a server.",
            invalid_time: "Invalid duration. Use e.g. `30m`, `2h`, `1d`.",
            time_too_short: "Minimum duration is 1 minute.",
            time_too_long: "Maximum duration is 30 days.",
            giveaway_started: "🎉 Giveaway started!",
            prize: "Prize",
            ends: "Ends",
            winners: "Winner(s)",
            enter: "🎉 Enter Giveaway",
            not_found: "Giveaway not found.",
            ended: "Giveaway ended.",
            already_ended: "This giveaway has already ended.",
            not_ended: "This giveaway is still running.",
            no_entries: "No entries, couldn't pick a winner.",
            rerolled: "Winner rerolled!",
            new_winner: "New winner",
            active_giveaways: "Active Giveaways",
            none_active: "No active giveaways in this server.",
            hoster: "Hosted by"
        };
        if (lang !== "en") {
            try { texts = await utils.autoTranslate(texts, "en", lang); } catch {}
        }
        if (!interaction.guildId) {
            return utils.safeInteractionRespond(interaction, { content: texts.no_guild, ephemeral: true });
        }
        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const respond = (payload: any) => utils.safeInteractionRespond(interaction, { ...payload, ephemeral: true });
        if (sub === "start") {
            const prize = interaction.options.getString("prize", true);
            const durationStr = interaction.options.getString("duration", true);
            const winnerCount = interaction.options.getInteger("winners") ?? 1;
            const description = interaction.options.getString("description") ?? undefined;
            const ms = utils.parseDurationString(durationStr);
            if (!ms || ms < 60000) return respond({ content: texts.invalid_time + (ms && ms < 60000 ? " " + texts.time_too_short : "") });
            if (ms > 2592000000) return respond({ content: texts.time_too_long });
            const endsAt = Date.now() + ms;
            const result = await db.query("INSERT INTO giveaways SET ?", [{
                guild_id: guildId,
                channel_id: interaction.channelId,
                prize, description: description || null,
                winner_count: winnerCount,
                ends_at: endsAt,
                created_by: interaction.user.id,
                created_at: Date.now()
            }]) as any;
            const giveawayId = result.insertId;
            const embed = new EmbedBuilder()
                .setColor("Gold")
                .setTitle(`🎉 ${prize}`)
                .setDescription(description || "")
                .addFields(
                    { name: texts.prize, value: prize, inline: true },
                    { name: texts.winners, value: String(winnerCount), inline: true },
                    { name: texts.ends, value: `<t:${Math.floor(endsAt / 1000)}:R>`, inline: true },
                    { name: texts.hoster, value: `<@${interaction.user.id}>`, inline: true }
                )
                .setFooter({ text: `ID: ${giveawayId}` })
                .setTimestamp();
            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway_enter_${giveawayId}`)
                    .setLabel(texts.enter)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji("🎉")
            );
            const msg = await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });
            await db.query("UPDATE giveaways SET message_id = ? WHERE id = ?", [msg.id, giveawayId]);
            return respond({ content: texts.giveaway_started });
        }
        if (sub === "end") {
            const id = interaction.options.getString("id", true);
            const rows = await db.query("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?", [id, guildId]) as unknown as any[];
            if (!rows[0]) return respond({ content: texts.not_found });
            if (rows[0].ended) return respond({ content: texts.already_ended });
            const result = await utils.resolveGiveaway(Number(id), lang);
            if (!result.ok) return respond({ content: texts.already_ended });
            return respond({ content: texts.ended });
        }
        if (sub === "reroll") {
            const id = interaction.options.getString("id", true);
            const rows = await db.query("SELECT * FROM giveaways WHERE id = ? AND guild_id = ?", [id, guildId]) as unknown as any[];
            if (!rows[0]) return respond({ content: texts.not_found });
            if (!rows[0].ended) return respond({ content: texts.not_ended });
            const result = await utils.rerollGiveawayWinner(Number(id), guildId, lang);
            if (!result.ok) return respond({ content: result.error === "No eligible entries to reroll" ? texts.no_entries : texts.not_found });
            return respond({ content: `${texts.new_winner}: <@${result.newWinner}>` });
        }
        if (sub === "list") {
            const rows = await db.query("SELECT * FROM giveaways WHERE guild_id = ? AND ended = FALSE ORDER BY ends_at ASC", [guildId]) as unknown as any[];
            if (!rows[0]) return respond({ content: texts.none_active });
            const list = rows.map((g: any) => `**#${g.id}** - ${g.prize} - ${texts.ends} <t:${Math.floor(g.ends_at / 1000)}:R>`).join("\n");
            const embed = new EmbedBuilder()
                .setColor("Gold")
                .setTitle(texts.active_giveaways)
                .setDescription(list)
                .setTimestamp();
            return respond({ embeds: [embed] });
        }
    },
    ephemeral: true
};

