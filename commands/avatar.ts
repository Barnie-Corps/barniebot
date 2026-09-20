import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import utils from "../utils";

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
    category: "Utility",
    async execute(interaction: ChatInputCommandInteraction, lang: string) {
        const target = interaction.options.getUser("target") ?? interaction.user;

        let texts = {
            avatarOf: `${target.username}'s Avatar`,
            requestedBy: `Requested by ${interaction.user.username}`
        };
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: interaction.user.username,
                iconURL: interaction.user.displayAvatarURL()
            })
            .setTitle(texts.avatarOf)
            .setImage(target.displayAvatarURL({ size: 1024 }))
            .setColor("Purple")
            .setFooter({ text: texts.requestedBy })
            .setTimestamp();

        await utils.safeInteractionRespond(interaction, { embeds: [embed], content: "" });
    },
    ephemeral: false
};