import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel, } from "discord.js";
import db from "../mysql/database";
import utils from "../utils";
import data from "../data";
import ai from "../ai";
import * as fs from "fs";
import { FunctionCall } from "@google/genai";

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
                not_vip: "You must be a VIP to use this feature.",
                no_response: "Oh no! I couldn't generate a reply. Try repeating what you said, maybe changing a couple of words.",
                long_response: "Oh no! The response is too long. I'll send it as a Markdown-formatted text file.",
            },
            common: {
                question: "Your question was:",
                thinking: "Thinking...",
                started_chat: "The chat with the AI has started. You can say one of the following phrases to stop it:",
                stopped_ai: "The chat with the AI has been disabled.",
                can_take_time: "Remember that the AI's reply can take a bit of time. If you send multiple messages before getting a response or start flooding the chat, you'll lose access to this command indefinitely.",
                ai_left: "The AI decided to end the conversation. Here's the reason it gave.",
            },
            success: {}
        }
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        const subcmd = interaction.options.getSubcommand();
        switch (subcmd) {
            case "ask": {
                return await interaction.editReply("Temporary unavailable due to high demand. Please use the chat command.");
                await interaction.editReply(texts.common.thinking);
                const question = interaction.options.getString("question") as string;
                const response = await ai.GetSingleResponse(interaction.user.id, `Answer the following question as briefly as possible and in the language used in the question: ${question}`);
                if (response.length < 1) return await interaction.editReply(texts.errors.no_response);
                if (response.length > 2000) {
                    const filename = `./ai-response-${Date.now()}.md`;
                    fs.writeFileSync(filename, response, "utf-8");
                    await interaction.editReply({ content: texts.errors.long_response, files: [filename] });
                    fs.unlinkSync(filename);
                    return;
                }   
                await interaction.editReply(response);
                break;
            }
            case "chat": {
                if (!await utils.isVIP(interaction.user.id) && !data.bot.owners.includes(interaction.user.id)) return await interaction.editReply(texts.errors.not_vip);
                const collector = (interaction.channel as any).createMessageCollector({ 
                    filter: (m: { author: { id: string } }) => m.author.id === interaction.user.id 
                });
                await interaction.editReply(`${texts.common.started_chat} \`stop ai, ai stop, stop chat, end ai\`\n${texts.common.can_take_time}`);
                collector?.on("collect", async (message: any): Promise<any> => {
                    await (interaction.channel as TextChannel).sendTyping?.();
                    if (["stop ai", "ai stop", "stop chat", "end ai"].some(stop => message.content.toLowerCase().includes(stop))) {
                        await interaction.followUp(texts.common.stopped_ai);
                        collector?.stop();
                        return;
                    }
                    const response = await ai.GetResponse(interaction.user.id, message.content);
                    if (response.text.length < 1 && !response.call) {
                        console.log("No response from AI", response);
                        return await message.reply(texts.errors.no_response);
                    }
                    if (response.text.length > 2000) {
                        const filename = `./ai-response-${Date.now()}.md`;
                        fs.writeFileSync(filename, response.text, "utf-8");
                        await message.reply({ content: texts.errors.long_response, files: [filename] });
                        fs.unlinkSync(filename);
                        return;
                    }
                    if (response.call) {
                        if ((response.call as FunctionCall).name === "end_conversation") {
                            await message.reply(`${texts.common.ai_left}\n${(response.call as FunctionCall).args?.reason || "No reason provided."}`);
                            collector?.stop();
                            return;
                        }
                    }
                    const msg = await message.reply(response.call ? `Executing function ${(response.call as FunctionCall).name} ${data.bot.loadingEmoji.mention}` : response.text);
                    if (response.call) {
                        await ai.ExecuteFunction(interaction.user.id, (response.call as FunctionCall).name!, (response.call as FunctionCall).args, msg);
                    }
                });
                collector?.on("end", () => {
                    ai.ClearChat(interaction.user.id);
                });
                break;
            }
        }
    }
}