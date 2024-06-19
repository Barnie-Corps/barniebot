import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder, } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";

export default {
    data: new SlashCommandBuilder()
        .setName("ai")
        .setDescription("Uses the AI")
        .addSubcommand(s =>
            s.setName("ask")
                .setDescription("Asks the AI a question.")
                .addStringOption(option =>
                    option.setName("question")
                        .setDescription("The question to ask the AI.")
                        .setRequired(true)
                )
        ),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                not_vip: "You must be VIP to use this feature."
            },
            common: {
                question: "Tu pregunta fue:",
                answer: "Aquí está mi respuesta a tu pregunta:",
                thinking: "Pensando..."
            }
        }
        if (lang !== "es") {
            texts = await utils.autoTranslate(texts, "es", lang);
        }
        const subcmd = interaction.options.getSubcommand();
        switch (subcmd) {
            case "ask": {
                await interaction.editReply(texts.common.thinking);
                const question = interaction.options.getString("question") as string;
                const response = await utils.getAiResponse(question, lang, interaction.user.id);
                await interaction.editReply(`${texts.common.question} ${question}\n\n${texts.common.answer}\n ${response}`);
                break;
            }
        }
    }
}