import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel, VoiceChannel, GuildMember, AttachmentBuilder } from "discord.js";
import {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    VoiceConnectionStatus,
    EndBehaviorType,
    AudioPlayerStatus,
    getVoiceConnection
} from "@discordjs/voice";
import db from "../mysql/database";
import utils from "../utils";
import data from "../data";
import ai from "../ai";
import * as fs from "fs";
import * as path from "path";
import { FunctionCall } from "@google/genai";
import NVIDIAModels from "../NVIDIAModels";
import { prepareAudioForASR, stereoToMono, resampleAudio } from "../utils/audioUtils";
import { Writable, PassThrough } from "stream";
import prism from "prism-media";

export default {
    data: new SlashCommandBuilder()
        .setName("ai")
        .setDescription("Uses the AI")
        .addSubcommand(s =>
            s.setName("ask")
                .setDescription("Asks the AI a question.")
                .addStringOption(o =>
                    o.setName("question")
                        .setDescription("The question to ask the AI.")
                        .setRequired(true)
                )
                .addStringOption(o =>
                    o.setName("task")
                        .setDescription("The type of question or reasoning task (for better context handling and model selection)")
                        .setRequired(true)
                        .addChoices(
                            { name: "General Question", value: "chat" },
                            { name: "Math Problem", value: "math" },
                            { name: "Programming Help", value: "programming" },
                            { name: "General reasoning", value: "reasoning" }
                        )
                )
                .addBooleanOption(o => o.setName("think").setDescription("Enable 'think' mode for complex reasoning tasks. (If applicable in the selected model)"))
        )
        .addSubcommand(s =>
            s.setName("chat")
                .setDescription("Starts a chat with the AI.")
        )
        .addSubcommand(s =>
            s.setName("voice")
                .setDescription("Starts a voice conversation with the AI (requires being in a voice channel).")
        ),
    category: "AI",
    execute: async (interaction: ChatInputCommandInteraction, lang: string) => {
        let texts = {
            errors: {
                not_vip: "You must be a VIP to use this feature.",
                no_response: "Oh no! I couldn't generate a reply. Try repeating what you said, maybe changing a couple of words.",
                long_response: "Oh no! The response is too long. I'll send it as a Markdown-formatted text file.",
                unsafe_message: "Your message was flagged as unsafe. Conversation cannot continue and it'll be ended. You can reach out in our support server if you believe this was a mistake made by the safety check model.",
                guild_only: "This command can only be used in a server.",
                not_in_voice: "You must be in a voice channel to use this command.",
                no_male_voice: "No male voice available for language: {lang}. Supported languages: en-US, es-US, fr-FR, de-DE, zh-CN",
                voice_processing_error: "Sorry, I encountered an error processing your voice.",
                temporary_unavailable: "Temporary unavailable due to high demand. Please use the chat command."
            },
            common: {
                question: "Your question was:",
                thinking: "💭 Thinking...",
                started_chat: "The chat with the AI has started. You can say one of the following phrases to stop it:",
                stopped_ai: "The chat with the AI has been disabled.",
                can_take_time: "Remember that the AI's reply can take a bit of time. If you send multiple messages before getting a response or start flooding the chat, you'll lose access to this command indefinitely.",
                ai_left: "The AI decided to end the conversation. Here's the reason it gave.",
                reasons: "Reasons",
                no_reasons: "No reason provided.",
                reasoning: "reasoning",
            },
            voice: {
                joining: "Joining voice channel and starting AI conversation...\n\nSay \"stop\" or \"end conversation\" to stop.\nVoice:",
                listening: "👂 Listening...",
                processing: "🔄 Processing your speech...",
                thinking: "💭 Thinking...",
                speaking: "🗣️ Speaking...",
                you_said: "🎤 You: ",
                ai_said: "🤖 AI: ",
                ending: "Ending voice conversation.",
                timed_out: "Voice conversation timed out after 10 minutes.",
                executing_function: "Executing "
            },
            success: {}
        }
        if (lang !== "en") {
            texts = await utils.autoTranslate(texts, "en", lang);
        }
        const subcmd = interaction.options.getSubcommand();
        const reply = (content: any) => {
            return utils.safeInteractionRespond(interaction, content);
        }
        switch (subcmd) {
            case "ask": {
                await reply(texts.common.thinking);
                const question = interaction.options.getString("question") as string;
                const think = interaction.options.getBoolean("think") || false;
                const response = await NVIDIAModels.GetModelChatResponse([{ role: "user", content: `Answer the following question as briefly as possible and in the language used in the question: ${question}\n${"-".repeat(20)}\n Please avoid using complex markdown elements (i.e mathematical elements) as Discord does not support them. Only basic Markdown styling is supported in Discord.` }], 20000, interaction.options.getString("task") as string, think);
                if (response.content.length < 1) return await reply(texts.errors.no_response);
                if (response.content.length > 2000) {
                    const filename = `./ai-response-${Date.now()}.md`;
                    fs.writeFileSync(filename, `${response.reasoning ? `${"-".repeat(20)}\n${texts.common.reasoning}: ${response.reasoning}\n${"-".repeat(20)}\n` : ""}${response.content}`, "utf-8");
                    await reply({ content: texts.errors.long_response, files: [filename] });
                    fs.unlinkSync(filename);
                    return;
                }
                await reply(response.content);
                break;
            }
            case "chat": {
                if (!await utils.isVIP(interaction.user.id) && !data.bot.owners.includes(interaction.user.id)) return await reply(texts.errors.not_vip);
                const collector = (interaction.channel as any).createMessageCollector({
                    filter: (m: { author: { id: string } }) => m.author.id === interaction.user.id
                });
                await reply(`${texts.common.started_chat} \`stop ai, ai stop, stop chat, end ai\`\n${texts.common.can_take_time}`);
                collector?.on("collect", async (message: any): Promise<any> => {
                    await (interaction.channel as TextChannel).sendTyping?.();
                    if (["stop ai", "ai stop", "stop chat", "end ai"].some(stop => message.content.toLowerCase().includes(stop))) {
                        await reply(texts.common.stopped_ai);
                        collector?.stop();
                        return;
                    }
                    const safety = await NVIDIAModels.GetConversationSafety([
                        { role: "user", content: message.content }
                    ]);
                    if (!safety.safe) {
                        if (lang !== "en") {
                            safety.reason = (await utils.translate(safety.reason || "", "en", lang)).text;
                        }
                        const reason = safety.reason ? `\n${texts.common.reasons}: ${safety.reason}` : "";
                        await message.reply(`${texts.errors.unsafe_message}${reason}`);
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
            case "voice": {
                if (!interaction.guild) return await utils.safeInteractionRespond(interaction, texts.errors.guild_only);
                if (!await utils.isVIP(interaction.user.id) && !data.bot.owners.includes(interaction.user.id)) return await utils.safeInteractionRespond(interaction, texts.errors.not_vip);

                const member = await interaction.guild.members.fetch(interaction.user.id);
                const voiceChannel = member?.voice?.channel;

                if (!voiceChannel) {
                    return await utils.safeInteractionRespond(interaction, texts.errors.not_in_voice);
                }

                const langCode = lang === "en" ? "en-US" : lang === "es" ? "es-US" : lang === "fr" ? "fr-FR" : lang === "de" ? "de-DE" : lang === "zh" ? "zh-CN" : "en-US";
                const maleVoice = NVIDIAModels.GetBestMaleVoice(langCode);

                if (!maleVoice) {
                    return await reply(texts.errors.no_male_voice + langCode);
                }

                await reply(texts.voice.joining + ` ${maleVoice}`);

                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: interaction.guild.id,
                    adapterCreator: interaction.guild.voiceAdapterCreator as any,
                    selfDeaf: false,
                    selfMute: false
                });

                const player = createAudioPlayer();
                connection.subscribe(player);

                let isProcessing = false;
                let isListening = false;
                let audioChunks: Buffer[] = [];
                let silenceTimeout: NodeJS.Timeout | null = null;
                const SILENCE_THRESHOLD = 1500;
                let listeningMessage: any = null;

                console.log(`[Voice AI] Started voice conversation for user ${interaction.user.id} in guild ${interaction.guild.id}`);
                console.log(`[Voice AI] Connection state: ${connection.state.status}`);
                console.log(`[Voice AI] Receiver ready: ${connection.receiver ? 'YES' : 'NO'}`);

                // Wait for connection to be ready
                connection.on(VoiceConnectionStatus.Ready, () => {
                    console.log(`[Voice AI] Connection is now READY, setting up audio receiver`);
                });

                connection.receiver.speaking.on("start", async (userId) => {
                    console.log(`[Voice AI] Speaking event fired for user ${userId}`);
                    if (userId !== interaction.user.id) {
                        console.log(`[Voice AI] Ignoring audio from user ${userId} (not command user ${interaction.user.id})`);
                        return;
                    }

                    if (isProcessing) {
                        console.log(`[Voice AI] Already processing, ignoring new audio from ${userId}`);
                        return;
                    }

                    if (isListening) {
                        console.log(`[Voice AI] Already listening, ignoring duplicate speaking event`);
                        return;
                    }

                    console.log(`[Voice AI] User ${userId} started speaking - starting audio capture`);
                    isListening = true;
                    audioChunks = [];

                    if (listeningMessage) {
                        await listeningMessage.delete().catch(() => { });
                    }
                    listeningMessage = await interaction.followUp(texts.voice.listening);

                    if (silenceTimeout) {
                        clearTimeout(silenceTimeout);
                        silenceTimeout = null;
                    }

                    const opusStream = connection.receiver.subscribe(userId, {
                        end: {
                            behavior: EndBehaviorType.AfterSilence,
                            duration: 1000
                        }
                    });

                    // Decode Opus to PCM (Discord audio is 48kHz stereo Opus)
                    const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });

                    decoder.on("error", (error: Error) => {
                        console.error(`[Voice AI] Decoder error:`, error);
                    });

                    opusStream.pipe(decoder);

                    decoder.on("data", (chunk: Buffer) => {
                        console.log(`[Voice AI] Received decoded PCM chunk: ${chunk.length} bytes`);
                        audioChunks.push(chunk);

                        if (silenceTimeout) {
                            clearTimeout(silenceTimeout);
                        }

                        silenceTimeout = setTimeout(async () => {
                            if (audioChunks.length === 0 || isProcessing) return;

                            isProcessing = true;
                            console.log(`[Voice AI] Processing ${audioChunks.length} audio chunks`);

                            // Deafen the bot while processing to avoid feedback and ignore channel audio
                            try {
                                const me = interaction.guild?.members.me;
                                if (me && !me.voice.serverDeaf) {
                                    await me.voice.setDeaf(true, "Processing voice input");
                                    console.log(`[Voice AI] Bot server-deafened while processing`);
                                }
                            } catch (e) {
                                console.warn(`[Voice AI] Failed to deafen bot while processing:`, e);
                            }

                            let statusMessage = listeningMessage;
                            if (statusMessage) {
                                await statusMessage.edit(texts.voice.processing).catch(() => { });
                            }

                            try {
                                const audioBuffer = Buffer.concat(audioChunks as any);
                                audioChunks = [];
                                isListening = false; // Reset immediately so user can interrupt with new speech
                                console.log(`[Voice AI] Combined audio buffer size: ${audioBuffer.length} bytes`);

                                if (audioBuffer.length < 10000) {
                                    console.log(`[Voice AI] Audio too short (${audioBuffer.length} bytes), skipping`);
                                    if (statusMessage) {
                                        await statusMessage.delete().catch(() => { });
                                        listeningMessage = null;
                                    }
                                    isProcessing = false;
                                    return;
                                }

                                console.log(`[Voice AI] Preparing audio for ASR...`);
                                console.log(`[Voice AI] Raw PCM: 48kHz stereo, ${audioBuffer.length} bytes = ${audioBuffer.length / 4 / 48000} seconds`);

                                // Discord audio is 48kHz stereo PCM - convert to 16kHz mono
                                let processedAudio = audioBuffer;

                                // First resample from 48kHz to 16kHz (stereo)
                                console.log(`[Voice AI] Resampling from 48kHz to 16kHz...`);
                                processedAudio = resampleAudio(processedAudio, 48000, 16000, 2);

                                // Then convert stereo to mono
                                console.log(`[Voice AI] Converting stereo to mono...`);
                                processedAudio = stereoToMono(processedAudio);

                                console.log(`[Voice AI] Prepared buffer size: ${processedAudio.length} bytes`);
                                console.log(`[Voice AI] Expected duration: ${processedAudio.length / 2 / 16000} seconds at 16kHz mono`);

                                console.log(`[Voice AI] Calling STT API...`);
                                const transcript = await NVIDIAModels.GetSpeechToText(
                                    processedAudio,
                                    15000,
                                    process.env.NVIDIA_STT_FUNCTION_ID
                                );
                                console.log(`[Voice AI] STT result: "${transcript}"`);

                                if (!transcript || transcript.trim().length === 0) {
                                    console.log(`[Voice AI] Empty transcript, skipping`);
                                    if (statusMessage) {
                                        await statusMessage.delete().catch(() => { });
                                        listeningMessage = null;
                                    }
                                    // Ready for next input -> undeafen
                                    try {
                                        const me = interaction.guild?.members.me;
                                        if (me && me.voice.serverDeaf) {
                                            await me.voice.setDeaf(false, "Ready for next input");
                                            console.log(`[Voice AI] Bot undeafened (empty transcript)`);
                                        }
                                    } catch (e) {
                                        console.warn(`[Voice AI] Failed to undeafen bot (empty transcript):`, e);
                                    }
                                    isProcessing = false;
                                    return;
                                }

                                // Show what user said (without placeholder, just append text)
                                if (statusMessage) {
                                    await statusMessage.edit(`🎤 ${transcript}`).catch(() => { });
                                }

                                if (["stop", "end conversation", "goodbye"].some(word => transcript.toLowerCase().includes(word))) {
                                    console.log(`[Voice AI] User requested to end conversation`);
                                    if (statusMessage) {
                                        await statusMessage.edit(texts.voice.ending).catch(() => { });
                                    }
                                    connection.destroy();
                                    ai.ClearChat(interaction.user.id);
                                    return;
                                }

                                console.log(`[Voice AI] Checking safety...`);
                                const safety = await NVIDIAModels.GetConversationSafety([
                                    { role: "user", content: transcript }
                                ]);
                                console.log(`[Voice AI] Safety check result: ${safety.safe}`);

                                if (!safety.safe) {
                                    console.log(`[Voice AI] Safety check failed, ending conversation`);
                                    if (statusMessage) {
                                        await statusMessage.edit(`${texts.errors.unsafe_message}`).catch(() => { });
                                    }
                                    connection.destroy();
                                    ai.ClearChat(interaction.user.id);
                                    // Ended -> undeafen
                                    try {
                                        const me = interaction.guild?.members.me;
                                        if (me && me.voice.serverDeaf) {
                                            await me.voice.setDeaf(false, "Ending conversation");
                                            console.log(`[Voice AI] Bot undeafened (safety fail)`);
                                        }
                                    } catch (e) {
                                        console.warn(`[Voice AI] Failed to undeafen bot (safety fail):`, e);
                                    }
                                    return;
                                }

                                if (statusMessage) {
                                    await statusMessage.edit(texts.voice.thinking).catch(() => { });
                                }
                                console.log(`[Voice AI] Getting AI response...`);
                                const response = await ai.GetVoiceResponse(interaction.user.id, transcript);
                                console.log(`[Voice AI] AI response received: ${response.text.substring(0, 100)}... (call: ${!!response.call})`);

                                if (response.text.length < 1 && !response.call) {
                                    console.log(`[Voice AI] No response from AI`);
                                    if (statusMessage) {
                                        await statusMessage.edit(texts.errors.no_response).catch(() => { });
                                    }
                                    isProcessing = false;
                                    return;
                                }

                                if (response.call && (response.call as FunctionCall).name === "end_conversation") {
                                    console.log(`[Voice AI] AI requested to end conversation`);
                                    if (statusMessage) {
                                        await statusMessage.edit(`${texts.common.ai_left}\n${(response.call as FunctionCall).args?.reason || texts.common.no_reasons}`).catch(() => { });
                                    }
                                    connection.destroy();
                                    ai.ClearChat(interaction.user.id);
                                    return;
                                }

                                let finalText = response.text;

                                if (response.call) {
                                    console.log(`[Voice AI] Executing function: ${(response.call as FunctionCall).name}`);
                                    if (statusMessage) {
                                        await statusMessage.edit(`⚙️ Executing ${(response.call as FunctionCall).name}...`).catch(() => { });
                                    }

                                    // Execute function - it will return the AI's response after seeing the function result
                                    const functionReply = await ai.ExecuteFunctionVoice(interaction.user.id, (response.call as FunctionCall).name!, (response.call as FunctionCall).args, null as any);
                                    console.log(`[Voice AI] Function executed, got reply: ${functionReply?.substring(0, 100)}...`);
                                    finalText = functionReply || response.text;
                                }

                                if (!finalText || finalText.trim().length === 0 || finalText === "...") {
                                    console.log(`[Voice AI] No valid text for TTS, skipping audio playback`);
                                    if (statusMessage) {
                                        await statusMessage.delete().catch(() => { });
                                        listeningMessage = null;
                                    }
                                    isProcessing = false;
                                    return;
                                }

                                // Show what AI said (without placeholder, just append text)
                                if (statusMessage) {
                                    await statusMessage.edit(`🤖 ${finalText.substring(0, 1950)}`).catch(() => { });
                                }

                                if (statusMessage) {
                                    await statusMessage.edit(texts.voice.speaking).catch(() => { });
                                }
                                console.log(`[Voice AI] Generating TTS for: "${finalText.substring(0, 50)}..."`);
                                const ttsAudio = await NVIDIAModels.GetTextToSpeech(
                                    finalText,
                                    maleVoice,
                                    langCode,
                                    15000,
                                    process.env.NVIDIA_TTS_FUNCTION_ID
                                );
                                console.log(`[Voice AI] TTS audio generated: ${ttsAudio.length} bytes`);

                                const wavHeader = createWavHeader(ttsAudio.length, 22050, 1, 16);
                                const wavBuffer = Buffer.concat([wavHeader, ttsAudio] as any);
                                const tempFile = path.join(__dirname, `../temp-tts-${Date.now()}.wav`);
                                fs.writeFileSync(tempFile, wavBuffer as any);

                                // If audio is currently playing, stop it to play the new response
                                if (player.state.status === AudioPlayerStatus.Playing) {
                                    console.log(`[Voice AI] Stopping current audio to play new response`);
                                    player.stop();
                                }

                                console.log(`[Voice AI] Playing audio file: ${tempFile}`);
                                const resource = createAudioResource(tempFile);
                                player.play(resource);

                                player.once(AudioPlayerStatus.Idle, () => {
                                    console.log(`[Voice AI] Finished playing audio`);
                                    if (fs.existsSync(tempFile)) {
                                        fs.unlinkSync(tempFile);
                                        console.log(`[Voice AI] Deleted temp file: ${tempFile}`);
                                    }
                                    if (statusMessage) {
                                        statusMessage.delete().catch(() => { });
                                        listeningMessage = null;
                                    }
                                    isProcessing = false;
                                    // Ready to listen again -> undeafen
                                    (async () => {
                                        try {
                                            const me = interaction.guild?.members.me;
                                            if (me && me.voice.serverDeaf) {
                                                await me.voice.setDeaf(false, "Ready for next input");
                                                console.log(`[Voice AI] Bot undeafened (playback finished)`);
                                            }
                                        } catch (e) {
                                            console.warn(`[Voice AI] Failed to undeafen bot (after playback):`, e);
                                        }
                                    })();
                                    console.log(`[Voice AI] Ready for next input`);
                                });

                            } catch (error) {
                                console.error("[Voice AI] Error in processAudio:", error);
                                console.error("[Voice AI] Error stack:", (error as Error).stack);
                                if (statusMessage) {
                                    await statusMessage.edit(texts.errors.voice_processing_error).catch(() => { });
                                }
                                // Error path -> attempt to undeafen so we can listen again
                                try {
                                    const me = interaction.guild?.members.me;
                                    if (me && me.voice.serverDeaf) {
                                        await me.voice.setDeaf(false, "Error during processing");
                                        console.log(`[Voice AI] Bot undeafened (error path)`);
                                    }
                                } catch (e) {
                                    console.warn(`[Voice AI] Failed to undeafen bot (error path):`, e);
                                }
                                isProcessing = false;
                            }
                        }, SILENCE_THRESHOLD);
                    });
                });

                connection.on(VoiceConnectionStatus.Disconnected, () => {
                    ai.ClearChat(interaction.user.id);
                    if (silenceTimeout) clearTimeout(silenceTimeout);
                });

                setTimeout(() => {
                    const conn = getVoiceConnection(interaction.guild!.id);
                    if (conn) {
                        conn.destroy();
                        ai.ClearChat(interaction.user.id);
                        interaction.followUp(texts.voice.timed_out).catch(() => { });
                    }
                }, 600000);

                break;
            }
        }
    }
}

function createWavHeader(dataLength: number, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
    header.writeUInt16LE(channels * (bitsPerSample / 8), 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataLength, 40);
    return header;
}