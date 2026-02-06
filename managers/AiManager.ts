import EventEmitter from "events";
import { Ratelimit } from "../types/interfaces";
import utils from "../utils";
import type { NIMChatSession } from "./NVIDIAModelsManager";
import Log from "../Log";
import AIFunctions from "../AIFunctions";
import { Message, ActionRowBuilder, ButtonBuilder } from "discord.js";
import * as fs from "fs";
import path from "path";
import data from "../data";
import NVIDIAModels from "../NVIDIAModels";

class AiManager extends EventEmitter {
    private ratelimits: Map<string, Ratelimit> = new Map();
    private chats: Map<string, NIMChatSession> = new Map();
    private voiceChats: Map<string, NIMChatSession> = new Map();
    constructor(private ratelimit: number, private max: number, private timeout: number) {
        Log.info("AiManager initialized", { component: "AiManager" });
        setInterval(() => this.ClearTimeouts(), 1000);
        super();
    }
    public async ExecuteFunctionVoice(id: string, name: string, args: any, message: Message | null): Promise<any> {
        if (await this.RatelimitUser(id)) return { error: "You are sending too many messages, please wait a few seconds before sending another message." };
        const chat = await this.GetVoiceChat(id);
        const func: any = utils.AIFunctions[name as keyof typeof utils.AIFunctions];
        if (!func) {
            if (message) await message.edit(`The AI requested an unknown function, attempting to recover... ${data.bot.loadingEmoji.mention}`);
            const rsp = await chat.sendMessage([
                {
                    functionResponse: {
                        name,
                        response: {
                            result: { error: "Unknown function" }
                        }
                    }
                }
            ]);
            if (rsp.response.functionCalls()?.length) {
                if (message) await message.edit(`Executing command ${(rsp.response.functionCalls() as any)[0].name} ${data.bot.loadingEmoji.mention}`);
                return this.ExecuteFunctionVoice(id, (rsp.response.functionCalls() as any)[0].name, (rsp.response.functionCalls() as any)[0].args, message);
            }
        }
        let preparedArgs: any = args;
        if (["current_guild_info", "on_guild"].includes(name)) {
            preparedArgs = message as any;
        } else {
            const isPlainObject = typeof args === "object" && args !== null && !Array.isArray(args);
            if (isPlainObject) {
                if (Object.keys(args).length === 0) {
                    preparedArgs = id;
                } else {
                    preparedArgs = {
                        ...args,
                        requesterId: id,
                        guildId: message?.guild?.id ?? null,
                        channelId: message?.channel?.id ?? null
                    };
                }
            } else if (preparedArgs === null || preparedArgs === undefined || preparedArgs === "") {
                preparedArgs = id;
            }
        }
        let rawResult: any;
        try {
            rawResult = await func(preparedArgs);
        } catch (error: any) {
            Log.error(`AI function ${name} threw an exception`, error instanceof Error ? error : new Error(String(error)));
            rawResult = { error: error instanceof Error ? error.message : String(error) };
        }
        let attachments: Array<{ path: string; name?: string }> = [];
        let sanitizedResult = rawResult;
        if (rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)) {
            const { __attachments, ...rest } = rawResult as any;
            if (Array.isArray(__attachments)) {
                attachments = __attachments
                    .filter((item: any) => item && typeof item.path === "string")
                    .map((item: any) => ({ path: item.path, name: item.name }));
            }
            sanitizedResult = rest;
        }
        let reply = "";
        const rsp = await chat.sendMessage([
            {
                functionResponse: {
                    name,
                    response: {
                        result: sanitizedResult
                    }
                }
            }
        ]);
        if (rsp.response.functionCalls()?.length) {
            if (message) {
                await message.edit(`Executing command ${(rsp.response.functionCalls() as any)[0].name} ${data.bot.loadingEmoji.mention}`);
            }
            return this.ExecuteFunctionVoice(id, (rsp.response.functionCalls() as any)[0].name, (rsp.response.functionCalls() as any)[0].args, message);
        }
        reply = rsp.response.text();
        const filesPayload = attachments.map(att => ({
            attachment: att.path,
            name: att.name ?? path.basename(att.path)
        }));
        if (reply.length > 2000) {
            const filename = `./ai-response-${Date.now()}.md`;
            fs.writeFileSync(filename, reply);
            filesPayload.push({ attachment: filename, name: path.basename(filename) });
            try {
                if (message) {
                    await message.edit({
                        content: "The response from the AI was too long, so it has been sent as a file.",
                        files: filesPayload,
                        attachments: []
                    });
                }
            } finally {
                try {
                    fs.unlinkSync(filename);
                } catch (error) {
                    Log.warn("Failed to remove temporary AI response file", { error: String(error) });
                }
            }
            return;
        }
        if (message) {
            if (filesPayload.length > 0) {
                await message.edit({ content: reply.length ? reply : " ", files: filesPayload, attachments: [] });
            } else {
                await message.edit(reply.length ? reply : " ");
            }
        }
        return reply;
    }
    public async RatelimitUser(id: string): Promise<boolean> {
        if (!this.ratelimits.has(id)) {
            this.ratelimits.set(id, {
                id,
                messages: 1,
                time: Date.now()
            });
            return false;
        }
        const ratelimit = this.ratelimits.get(id) as Ratelimit;
        if (Date.now() - ratelimit.time > this.timeout) {
            ratelimit.time = Date.now();
            ratelimit.messages = 1;
            return false;
        }
        ratelimit.messages++;
        if (ratelimit.messages > this.max) return true;
        return false;
    }
    public async RemoveRatelimit(id: string): Promise<void> {
        this.ratelimits.delete(id);
    }
    public async GetResponse(id: string, text: string): Promise<any> {
        if (await this.RatelimitUser(id)) return "You are sending too many messages, please wait a few seconds before sending another message.";
        const chat = await this.GetChat(id, text);
        const response = await utils.getAiResponse(text, chat);
        return response;
    }
    public async GetSingleResponse(id: string, text: string): Promise<string> {
        if (await this.RatelimitUser(id)) return "You are sending too many messages, please wait a few seconds before sending another message.";
        const response = await NVIDIAModels.GetModelChatResponse([{ role: "user", content: text }], 20000, "chat", false);
        return response.content;
    }
    public async GetVoiceResponse(id: string, text: string): Promise<any> {
        if (await this.RatelimitUser(id)) return { text: "You are sending too many messages, please wait a few seconds before sending another message.", call: null };
        const chat = await this.GetVoiceChat(id);
        const response = await utils.getAiResponse(text, chat);
        return response;
    }
    public async ExecuteFunction(id: string, name: string, args: any, message: Message): Promise<any> {
        if (await this.RatelimitUser(id)) return { error: "You are sending too many messages, please wait a few seconds before sending another message." };
        const chat = await this.GetChat(id, "");
        const func: any = utils.AIFunctions[name as keyof typeof utils.AIFunctions];
        if (!func) {
            await message.edit(`The AI requested an unknown function, attempting to recover... ${data.bot.loadingEmoji.mention}`);
            const rsp = await chat.sendMessage([
                {
                    functionResponse: {
                        name,
                        response: {
                            result: { error: "Unknown function" }
                        }
                    }
                }
            ]);
            if (rsp.response.functionCalls()?.length) {
                await message.edit(`Executing command ${(rsp.response.functionCalls() as any)[0].name} ${data.bot.loadingEmoji.mention}`);
                return this.ExecuteFunction(id, (rsp.response.functionCalls() as any)[0].name, (rsp.response.functionCalls() as any)[0].args, message);
            }
        }
        if (name === "send_email") {
            const emailArgs = args as { to: string; subject: string; body: string };
            const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder().setCustomId(`confirm_email_${Date.now()}`).setLabel("Confirm Send").setStyle(3),
                new ButtonBuilder().setCustomId(`cancel_email_${Date.now()}`).setLabel("Cancel").setStyle(4)
            )
            await message.edit(`The AI requested to send an email, this action is not fully supported yet. ${data.bot.loadingEmoji.mention}`);
            const rsp = await chat.sendMessage([
                {
                    functionResponse: {
                        name,
                        response: {
                            result: { error: "Email support is not fully implemented yet" }
                        }
                    }
                }
            ]);
            await message.edit({
                content: `The AI is attempting to send an email with the following details:\n**To:** ${emailArgs.to}\n**Subject:** ${emailArgs.subject}\n**Body:**\n${emailArgs.body}\n\nPlease confirm to send the email or cancel to abort.`,
                components: [confirmRow],
                attachments: []
            });
            return;
        }
        let preparedArgs: any = args;
        if (["current_guild_info", "on_guild"].includes(name)) {
            preparedArgs = message;
        } else {
            const isPlainObject = typeof args === "object" && args !== null && !Array.isArray(args);
            if (isPlainObject) {
                if (Object.keys(args).length === 0) {
                    preparedArgs = id;
                } else {
                    preparedArgs = {
                        ...args,
                        requesterId: id,
                        guildId: message?.guild?.id ?? null,
                        channelId: message?.channel?.id ?? null
                    };
                }
            } else if (preparedArgs === null || preparedArgs === undefined || preparedArgs === "") {
                preparedArgs = id;
            }
        }
        let rawResult: any;
        try {
            rawResult = await func(preparedArgs);
        } catch (error: any) {
            Log.error(`AI function ${name} threw an exception`, error instanceof Error ? error : new Error(String(error)));
            rawResult = { error: error instanceof Error ? error.message : String(error) };
        }
        let attachments: Array<{ path: string; name?: string }> = [];
        let sanitizedResult = rawResult;
        if (rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)) {
            const { __attachments, ...rest } = rawResult as any;
            if (Array.isArray(__attachments)) {
                attachments = __attachments
                    .filter((item: any) => item && typeof item.path === "string")
                    .map((item: any) => ({ path: item.path, name: item.name }));
            }
            sanitizedResult = rest;
        }
        let reply = "";
        const rsp = await chat.sendMessage([
            {
                functionResponse: {
                    name,
                    response: {
                        result: sanitizedResult
                    }
                }
            }
        ]);
        if (rsp.response.functionCalls()?.length) {
            if (message) {
                await message.edit(`Executing command ${(rsp.response.functionCalls() as any)[0].name} ${data.bot.loadingEmoji.mention}`);
            }
            return this.ExecuteFunction(id, (rsp.response.functionCalls() as any)[0].name, (rsp.response.functionCalls() as any)[0].args, message);
        }
        reply = rsp.response.text();
        const filesPayload = attachments.map(att => ({
            attachment: att.path,
            name: att.name ?? path.basename(att.path)
        }));
        if (reply.length > 2000) {
            const filename = `./ai-response-${Date.now()}.md`;
            fs.writeFileSync(filename, reply);
            filesPayload.push({ attachment: filename, name: path.basename(filename) });
            try {
                if (message) {
                    await message.edit({
                        content: "The response from the AI was too long, so it has been sent as a file.",
                        files: filesPayload,
                        attachments: []
                    });
                }
            } finally {
                try {
                    fs.unlinkSync(filename);
                } catch (error) {
                    Log.warn("Failed to remove temporary AI response file", { error: String(error) });
                }
            }
            return;
        }
        if (message) {
            if (filesPayload.length > 0) {
                await message.edit({ content: reply.length ? reply : " ", files: filesPayload, attachments: [] });
            } else {
                await message.edit(reply.length ? reply : " ");
            }
        }
        return reply;
    }
    private async GetChat(id: string, text: string): Promise<NIMChatSession> {
        let chat = this.chats.get(id);
        if (!chat) {
            chat = NVIDIAModels.CreateChatSession({
                tools: AIFunctions,
                maxTokens: 800,
                temperature: 0.7,
                topP: 0.8,
                systemInstruction: "Before responding to any user message at the start of the conversation, call the tools get_user_data, get_memories, and fetch_ai_rules in that order. Do not include <think> tags in responses."
            });
            this.chats.set(id, chat);
        }
        return this.chats.get(id) as NIMChatSession;
    }
    private async GetVoiceChat(id: string): Promise<NIMChatSession> {
        let chat = this.voiceChats.get(id);
        if (!chat) {
            chat = NVIDIAModels.CreateChatSession({
                tools: AIFunctions,
                maxTokens: 256,
                temperature: 0.7,
                topP: 0.8,
                systemInstruction: "You are the assistant's voice mode. Respond concisely (ideally 1–2 short sentences or tight bullets). Use the user's language. Avoid long explanations, code blocks, and heavy markdown unless explicitly requested. Before responding to any user message, call the tools get_user_data, get_memories, and fetch_ai_rules in that order. Do not include <think> tags in responses."
            });
            this.voiceChats.set(id, chat);
        }
        return this.voiceChats.get(id) as NIMChatSession;
    }
    private ClearTimeouts(): void {
        this.ratelimits.forEach((ratelimit) => {
            if (Date.now() - ratelimit.time > this.timeout) this.ratelimits.delete(ratelimit.id);
        });
    }

    public async ClearChat(id: string): Promise<void> {
        this.chats.delete(id);
        this.voiceChats.delete(id);
    }
}
export default AiManager;
