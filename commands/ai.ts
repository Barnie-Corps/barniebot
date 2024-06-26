import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder, } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import data from "../data";

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
        )
        .addSubcommand(s =>
            s.setName("chat")
                .setDescription("Starts a chat with the AI.")
        ),
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                not_vip: "Debes ser VIP para usar esta función.",
                no_response: "¡Oh no! No pude generar una respuesta, prueba repitiendo lo que dijiste, tal vez cambiando un par de palabras."
            },
            common: {
                question: "Tu pregunta fue:",
                answer: "Aquí está mi respuesta a tu pregunta:",
                thinking: "Pensando...",
                started_chat: "El chat con la Inteligencia Artificial se ha iniciado, puedes decir una de las siguientes frases para detenerla:",
                stopped_ai: "El chat con la Inteligencia Artificial ha sido detenido.",
                can_take_time: "Recuerda que la respuesta de la IA puede tomar tiempo, si envías varios mensajes antes de recibir respuesta o empiezas a enviar demasiados mensajes juntos, se te prohibirá el acceso a este comando indefinidamente."
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
                const response = await utils.getAiResponse(question, lang, interaction.user.id, true);
                if (response.length < 1) return await interaction.editReply(texts.errors.no_response);
                await interaction.editReply(`${texts.common.question} ${question}\n\n${texts.common.answer}\n ${response}`);
                break;
            }
            case "chat": {
                if (!await utils.isVIP(interaction.user.id) && !data.bot.owners.includes(interaction.user.id)) return await interaction.editReply(texts.errors.not_vip);
                const collector = interaction.channel?.createMessageCollector({ filter: m => m.author.id === interaction.user.id });
                let firstMsg = true;
                await interaction.editReply(`${texts.common.started_chat} \`stop ai, ai stop, detener ia, detener ai\`\n${texts.common.can_take_time}`);
                collector?.on("collect", async (message): Promise<any> => {
                    await interaction.channel?.sendTyping();
                    if (["stop ai", "detener ai", "detener ia", "ai stop"].some(stop => message.content.toLowerCase().includes(stop))) {
                        await interaction.followUp(texts.common.stopped_ai);
                        collector?.stop();
                        return;
                    }
                    const response = await utils.getAiResponse(message.content, lang, interaction.user.id, firstMsg);
                    if (response.length < 1) return await message.reply(texts.errors.no_response);
                    if (firstMsg) firstMsg = false;
                    await message.reply(response);
                });
            }
        }
    }
}