import { ChatInputCommandInteraction, SlashCommandBuilder, TextChannel, VoiceChannel, GuildMember, AttachmentBuilder, Message, PermissionFlagsBits, ChannelType } from "discord.js";
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
import client from "..";
import * as fs from "fs";
import * as path from "path";
import { FunctionCall } from "@google/genai";
import langs from "langs";
import NVIDIAModels from "../NVIDIAModels";
import { prepareAudioForASR, stereoToMono, resampleAudio } from "../utils/audioUtils";
import { Writable, PassThrough } from "stream";
import prism from "prism-media";

const AI_DEBUG = process.env.AI_DEBUG === "1";

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
        )
        .addSubcommand(s =>
            s.setName("monitor")
                .setDescription("Configure AI monitoring for this guild")
                .addStringOption(o =>
                    o.setName("action")
                        .setDescription("Enable, disable, or check status")
                        .setRequired(true)
                        .addChoices(
                            { name: "Enable", value: "enable" },
                            { name: "Disable", value: "disable" },
                            { name: "Status", value: "status" }
                        )
                )
                .addChannelOption(o =>
                    o.setName("logs_channel")
                        .setDescription("Logs channel for AI monitor alerts")
                        .setRequired(false)
                )
                .addBooleanOption(o =>
                    o.setName("allow_actions")
                        .setDescription("Allow the AI to take automatic actions")
                        .setRequired(false)
                )
                .addBooleanOption(o =>
                    o.setName("analyze_potential")
                        .setDescription("Also analyze potentially harmful links, attachments, invite spam, and raid signals")
                        .setRequired(false)
                )
                .addBooleanOption(o =>
                    o.setName("allow_investigation_tools")
                        .setDescription("Allow the large model to use safe investigation tools for AI monitor")
                        .setRequired(false)
                )
                .addStringOption(o =>
                    o.setName("alerts_language")
                        .setDescription("Language code for AI monitor alerts (e.g., en, es, fr)")
                        .setRequired(false)
                )
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
                not_admin: "Administrator permission is required to configure AI monitoring.",
                not_in_voice: "You must be in a voice channel to use this command.",
                no_male_voice_prefix: "No male voice available for language:",
                no_male_voice_supported: "Supported languages: en-US, es-US, fr-FR, de-DE, zh-CN",
                voice_processing_error: "Sorry, I encountered an error processing your voice.",
                temporary_unavailable: "Temporary unavailable due to high demand. Please use the chat command.",
                max_attachments: "You can only send up to 1 attachment per message.",
                monitor_already_enabled: "AI monitor is already enabled for this guild.",
                monitor_already_disabled: "AI monitor is already disabled for this guild.",
                monitor_disabled: "AI monitor is disabled for this guild.",
                invalid_language: "Invalid language code.",
                language_too_long: "Language code cannot have more than 2 characters.",
                logs_channel_required: "Please provide a text logs channel.",
                invalid_action: "Invalid action.",
            },
            common: {
                question: "Your question was:",
                thinking: "💭 Thinking...",
                started_chat: "The chat with the AI has started. You can say one of the following phrases to stop it:",
                stopped_ai: "The chat with the AI has been disabled.",
                can_take_time: "Remember that the AI's reply can take a bit of time. If you send multiple messages before getting a response or start flooding the chat, you'll lose access to this command indefinitely.",
                ai_left: "The AI decided to end the conversation: ",
                reasons: "Reasons",
                no_reasons: "No reason provided.",
                reasoning: "Reasoning",
                analyzing_image: "Analyzing the image you provided...",
                enabled: "enabled",
                disabled: "disabled",
                not_set: "not set",
                monitor_is: "AI monitor is",
                logs_label: "Logs:",
                auto_actions_label: "Auto actions:",
                potential_label: "Potential analysis:",
                tools_label: "Investigation tools:",
                alerts_language_label: "Alerts language:",
                monitor_enabled_label: "AI monitor enabled.",
                monitor_disabled_label: "AI monitor disabled.",
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
        const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> => {
            let timer: NodeJS.Timeout | null = null;
            try {
                return await Promise.race([
                    promise,
                    new Promise<null>(resolve => {
                        timer = setTimeout(() => resolve(null), timeoutMs);
                    })
                ]);
            } finally {
                if (timer) clearTimeout(timer);
            }
        };
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
                const convoOwnerId = interaction.user.id;
                let addedUserId: string | null = null;
                let conversationEndedBy: string | null = null;
                const add_user_to_convo = async (args: { userId?: string }): Promise<any> => {
                    if (!args?.userId) return { error: "Missing userId parameter" };
                    if (args.userId === convoOwnerId) return { error: "User is already in the conversation" };
                    if (addedUserId && addedUserId !== args.userId) return { error: "A user is already added to the conversation" };
                    try {
                        await client.users.fetch(args.userId);
                    } catch {
                        return { error: "User not found" };
                    }
                    addedUserId = args.userId;
                    return { success: true, addedUserId };
                };
                const remove_user_from_convo = async (args: { userId?: string }): Promise<any> => {
                    if (!addedUserId) return { error: "No user is currently added to the conversation" };
                    if (args?.userId && args.userId !== addedUserId) return { error: "Specified user is not in the conversation" };
                    const removedUserId = addedUserId;
                    addedUserId = null;
                    return { success: true, removedUserId };
                };
                ai.setLocalFunctionHandlers(convoOwnerId, {
                    add_user_to_convo,
                    remove_user_from_convo
                });
                const collector = (interaction.channel as any).createMessageCollector({
                    filter: (m: { author: { id: string } }) => m.author.id === convoOwnerId || (addedUserId !== null && m.author.id === addedUserId)
                });
                let isWaitingForResponse = false;
                await reply(`${texts.common.started_chat} \`stop ai, ai stop, stop chat, end ai\`\n${texts.common.can_take_time}`);
                collector?.on("collect", async (message: Message): Promise<any> => {
                    if (isWaitingForResponse) return;
                    isWaitingForResponse = true;
                    try {
                        if (["stop ai", "ai stop", "stop chat", "end ai"].some(stop => message.content.toLowerCase().includes(stop))) {
                            conversationEndedBy = message.author.id;
                            if (conversationEndedBy === convoOwnerId) {
                                await reply(texts.common.stopped_ai);
                            } else {
                                await reply(`${texts.common.stopped_ai} Ended by <@${conversationEndedBy}>.`);
                            }
                            await message.react("🛑");
                            collector?.stop();
                            return;
                        }
                        await (interaction.channel as TextChannel).sendTyping?.();

                        let imageDescription = "";
                        if (message.attachments.size > 0) {
                            if (message.attachments.size > 1) return await message.reply(texts.errors.max_attachments);
                            const attachment = message.attachments.first();
                            if (attachment) {
                                const analyzingMsg = await message.reply(texts.common.analyzing_image);
                                try {
                                    imageDescription = await NVIDIAModels.GetVisualDescription(attachment.url, message.id, lang);
                                    await analyzingMsg.delete().catch(() => { });
                                } catch {
                                    await analyzingMsg.delete().catch(() => { });
                                }
                            }
                        }
                        if (message.attachments.size > 0) await (interaction.channel as TextChannel).sendTyping?.();

                        const speakerLabel = message.author.id === convoOwnerId
                            ? `Speaker: Conversation owner (${message.author.username}, ${message.author.id})`
                            : `Speaker: Added user (${message.author.username}, ${message.author.id})`;
                        const payloadContent = message.attachments.size > 0
                            ? `<image>${imageDescription || "No visual details detected."}</image>\n\n${message.content}`
                            : message.content;
                        const userContent = `${speakerLabel}\n${payloadContent}`;

                        const safety = await NVIDIAModels.GetConversationSafety([
                            { role: "user", content: userContent }
                        ]);
                        if (!safety.safe && !(await utils.getUserStaffRank(message.author.id))) {
                            if (lang !== "en") {
                                safety.reason = (await utils.translate(safety.reason || "", "en", lang)).text;
                            }
                            const reason = safety.reason ? `\n${texts.common.reasons}: ${safety.reason}` : "";
                            await message.reply(`${texts.errors.unsafe_message}${reason}`);
                            collector?.stop();
                            return;
                        }
                        const response = await withTimeout(ai.GetResponse(interaction.user.id, userContent), 25000);
                        if (!response) {
                            console.warn("AI response timeout");
                            return await message.reply(texts.errors.no_response);
                        }
                        const structuredToolCalls = Array.isArray((response as any).toolCalls)
                            ? (response as any).toolCalls
                            : response.call ? [response.call] : [];
                        const toolParse = utils.parseToolCalls(response.text);
                        const toolCalls = structuredToolCalls.length ? structuredToolCalls : toolParse.toolCalls;
                        const cleanedResponseText = toolParse.cleanedText;
                        const hasToolCalls = toolCalls.length > 0;
                        if (!response.text || (response.text.length < 1 && !hasToolCalls)) {
                            if (AI_DEBUG) console.log("No response from AI", response);
                            return await message.reply(texts.errors.no_response);
                        }
                        if (hasToolCalls) {
                            const endCall = toolCalls.find((call: FunctionCall) => call.name === "end_conversation");
                            if (endCall) {
                                await message.reply(`${texts.common.ai_left} ${endCall.args?.reason || "No reason provided."}`);
                                collector?.stop();
                                return;
                            }
                            if (AI_DEBUG) {
                                console.log(`AI requested ${toolCalls.length} tool calls:`, toolCalls.map((call: FunctionCall) => call.name));
                            }
                            const toolLines = toolCalls.map((call: FunctionCall) => `Executing command ${call.name} ${data.bot.loadingEmoji.mention}`).join("\n");
                            const combined = cleanedResponseText ? `${cleanedResponseText}\n\n${toolLines}` : toolLines;
                            const msg = await message.reply(combined);
                            for (const call of toolCalls) {
                                await ai.ExecuteFunction(interaction.user.id, call.name, call.args, msg);
                            }
                            return;
                        }
                        if (response.text.length > 2000) {
                            const filename = `./ai-response-${Date.now()}.md`;
                            fs.writeFileSync(filename, cleanedResponseText || response.text, "utf-8");
                            await message.reply({ content: texts.errors.long_response, files: [filename] });
                            fs.unlinkSync(filename);
                            return;
                        }
                        await message.reply(cleanedResponseText || response.text);
                    } catch (error) {
                        console.error("AI chat handling failed:", error);
                        await message.reply(texts.errors.no_response);
                    } finally {
                        isWaitingForResponse = false;
                    }
                });
                collector?.on("end", () => {
                    ai.clearLocalFunctionHandlers(convoOwnerId);
                    ai.ClearChat(interaction.user.id);
                });
                break;
            }
            case "monitor": {
                if (!interaction.inGuild()) return await reply(texts.errors.guild_only);
                if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return await reply(texts.errors.not_admin);
                const action = interaction.options.getString("action", true);
                const logsChannel = interaction.options.getChannel("logs_channel");
                const allowActions = interaction.options.getBoolean("allow_actions") ?? false;
                const analyzePotential = interaction.options.getBoolean("analyze_potential") ?? false;
                const allowInvestigationTools = interaction.options.getBoolean("allow_investigation_tools") ?? false;
                const alertsLanguageRaw = interaction.options.getString("alerts_language");
                let alertsLanguage: string | null = null;
                if (alertsLanguageRaw) {
                    const normalized = alertsLanguageRaw.trim().toLowerCase();
                    if (normalized.length > 2) return await reply(texts.errors.language_too_long);
                    if (!langs.has(1, normalized) || ["ch", "br", "wa"].some(v => normalized === v)) {
                        return await reply(texts.errors.invalid_language);
                    }
                    alertsLanguage = normalized;
                }
                const existing = await db.query("SELECT * FROM ai_monitor_configs WHERE guild_id = ?", [interaction.guildId]) as unknown as any[];
                if (action === "status") {
                    if (!existing[0]) return await reply(texts.errors.monitor_disabled);
                    const statusText = existing[0].enabled ? texts.common.enabled : texts.common.disabled;
                    const channelText = existing[0].logs_channel && existing[0].logs_channel !== "0" ? `<#${existing[0].logs_channel}>` : texts.common.not_set;
                    const actionsText = existing[0].allow_actions ? texts.common.enabled : texts.common.disabled;
                    const potentialText = existing[0].analyze_potentially ? texts.common.enabled : texts.common.disabled;
                    const toolsText = existing[0].allow_investigation_tools ? texts.common.enabled : texts.common.disabled;
                    const languageText = typeof existing[0].monitor_language === "string" && existing[0].monitor_language.trim()
                        ? existing[0].monitor_language.trim().toLowerCase()
                        : "en";
                    const statusMessage = `${texts.common.monitor_is} ${statusText}. ${texts.common.logs_label} ${channelText}. ${texts.common.auto_actions_label} ${actionsText}. ${texts.common.potential_label} ${potentialText}. ${texts.common.tools_label} ${toolsText}. ${texts.common.alerts_language_label} ${languageText}.`;
                    return await reply(statusMessage);
                }
                if (action === "enable") {
                    if (!logsChannel || logsChannel.type !== ChannelType.GuildText) return await reply(texts.errors.logs_channel_required);
                    const now = Date.now();
                    const selectedLanguage = alertsLanguage ?? (existing[0]?.monitor_language ?? "en");
                    if (existing[0]) {
                        await db.query("UPDATE ai_monitor_configs SET enabled = TRUE, logs_channel = ?, allow_actions = ?, analyze_potentially = ?, allow_investigation_tools = ?, monitor_language = ?, updated_at = ? WHERE guild_id = ?", [logsChannel.id, allowActions, analyzePotential, allowInvestigationTools, selectedLanguage, now, interaction.guildId]);
                    } else {
                        await db.query("INSERT INTO ai_monitor_configs SET ?", [{
                            guild_id: interaction.guildId,
                            enabled: true,
                            logs_channel: logsChannel.id,
                            allow_actions: allowActions,
                            analyze_potentially: analyzePotential,
                            allow_investigation_tools: allowInvestigationTools,
                            monitor_language: selectedLanguage,
                            created_at: now,
                            updated_at: now
                        }]);
                    }
                    const enabledMessage = `${texts.common.monitor_enabled_label} ${texts.common.logs_label} <#${logsChannel.id}>. ${texts.common.auto_actions_label} ${allowActions ? texts.common.enabled : texts.common.disabled}. ${texts.common.potential_label} ${analyzePotential ? texts.common.enabled : texts.common.disabled}. ${texts.common.tools_label} ${allowInvestigationTools ? texts.common.enabled : texts.common.disabled}. ${texts.common.alerts_language_label} ${selectedLanguage}.`;
                    return await reply(enabledMessage);
                }
                if (action === "disable") {
                    if (!existing[0]) return await reply(texts.errors.monitor_disabled);
                    await db.query("UPDATE ai_monitor_configs SET enabled = FALSE, updated_at = ? WHERE guild_id = ?", [Date.now(), interaction.guildId]);
                    return await reply(texts.common.monitor_disabled_label);
                }
                return await reply(texts.errors.invalid_action);
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
                    return await reply(`${texts.errors.no_male_voice_prefix} ${langCode}. ${texts.errors.no_male_voice_supported}`);
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
                const safeEdit = async (m: any, content: any) => { if (!m) return; try { await m.edit(content); } catch (e: any) { if (e?.code === 10008) return; throw e; } };
                const safeDelete = async (m: any) => { if (!m) return; try { await m.delete(); } catch (e: any) { if (e?.code === 10008) return; throw e; } };

                console.log(`[Voice AI] Started voice conversation for user ${interaction.user.id} in guild ${interaction.guild.id}`);
                console.log(`[Voice AI] Connection state: ${connection.state.status}`);
                console.log(`[Voice AI] Receiver ready: ${connection.receiver ? 'YES' : 'NO'}`);

                connection.on(VoiceConnectionStatus.Ready, async () => {
                    console.log(`[Voice AI] Connection is now READY, setting up audio receiver`);
                    if (interaction.guild?.members.me && interaction.guild.members.me.voice.serverDeaf) {
                        await interaction.guild.members.me.voice.setDeaf(false, "No TTS to play");
                        console.log(`[Voice AI] Bot undeafened (no TTS)`);
                    }
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
                        await safeDelete(listeningMessage);
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
                            if (statusMessage) await safeEdit(statusMessage, texts.voice.processing);

                            try {
                                const audioBuffer = Buffer.concat(audioChunks as any);
                                audioChunks = [];
                                isListening = false;
                                console.log(`[Voice AI] Combined audio buffer size: ${audioBuffer.length} bytes`);

                                if (audioBuffer.length < 10000) {
                                    console.log(`[Voice AI] Audio too short (${audioBuffer.length} bytes), skipping`);
                                    if (statusMessage) { await safeDelete(statusMessage); listeningMessage = null; }
                                    isProcessing = false;
                                    return;
                                }

                                console.log(`[Voice AI] Preparing audio for ASR...`);
                                console.log(`[Voice AI] Raw PCM: 48kHz stereo, ${audioBuffer.length} bytes = ${audioBuffer.length / 4 / 48000} seconds`);

                                let processedAudio = audioBuffer;

                                // First resample from 48kHz to 16kHz (stereo)
                                console.log(`[Voice AI] Resampling from 48kHz to 16kHz...`);
                                processedAudio = Buffer.from(resampleAudio(processedAudio, 48000, 16000, 2));

                                // Convert stereo to mono
                                console.log(`[Voice AI] Converting stereo to mono...`);
                                processedAudio = Buffer.from(stereoToMono(processedAudio));

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
                                    if (statusMessage) { await safeDelete(statusMessage); listeningMessage = null; }
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

                                if (statusMessage) await safeEdit(statusMessage, `🎤 ${transcript}`);

                                if (["stop", "end conversation", "goodbye"].some(word => transcript.toLowerCase().includes(word))) {
                                    console.log(`[Voice AI] User requested to end conversation`);
                                    if (statusMessage) await safeEdit(statusMessage, texts.voice.ending);
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
                                    if (statusMessage) await safeEdit(statusMessage, `${texts.errors.unsafe_message}`);
                                    connection.destroy();
                                    ai.ClearChat(interaction.user.id);
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

                                if (statusMessage) await safeEdit(statusMessage, texts.voice.thinking);
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
                                    if (statusMessage) await safeEdit(statusMessage, `${texts.common.ai_left}\n${(response.call as FunctionCall).args?.reason || texts.common.no_reasons}`);
                                    connection.destroy();
                                    ai.ClearChat(interaction.user.id);
                                    return;
                                }

                                let finalText = response.text;

                                if (response.call) {
                                    console.log(`[Voice AI] Executing function: ${(response.call as FunctionCall).name}`);
                                    if (statusMessage) await safeEdit(statusMessage, `⚙️ Executing ${(response.call as FunctionCall).name}...`);

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
                                    if (interaction.guild?.members.me && interaction.guild.members.me.voice.serverDeaf) {
                                        await interaction.guild.members.me.voice.setDeaf(false, "No TTS to play");
                                        console.log(`[Voice AI] Bot undeafened (no TTS)`);
                                    }
                                    return;
                                }

                                if (statusMessage) await safeEdit(statusMessage, `🤖 ${finalText.substring(0, 1950)}`);

                                if (statusMessage) await safeEdit(statusMessage, texts.voice.speaking);
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

                                if (player.state.status === AudioPlayerStatus.Playing) {
                                    console.log(`[Voice AI] Stopping current audio to play new response`);
                                    player.stop();
                                }

                                console.log(`[Voice AI] Playing audio file: ${tempFile}`);
                                const resource = createAudioResource(tempFile);
                                player.play(resource);

                                player.once(AudioPlayerStatus.Idle, async () => {
                                    console.log(`[Voice AI] Finished playing audio`);
                                    if (fs.existsSync(tempFile)) {
                                        fs.unlinkSync(tempFile);
                                        console.log(`[Voice AI] Deleted temp file: ${tempFile}`);
                                    }
                                    if (statusMessage) { await safeDelete(statusMessage); listeningMessage = null; }
                                    isProcessing = false;
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
                                if (statusMessage) await safeEdit(statusMessage, texts.errors.voice_processing_error);
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