import EventEmitter from "events";
import { Ratelimit } from "../types/interfaces";
import utils from "../utils";
import type { NIMChatSession, NIMToolCall } from "./NVIDIAModelsManager";
import Log from "../Log";
import AIFunctions from "../AIFunctions";
import { Message, ActionRowBuilder, ButtonBuilder } from "discord.js";
import * as fs from "fs";
import path from "path";
import data from "../data";
import NVIDIAModels from "../NVIDIAModels";

const AI_DEBUG = process.env.AI_DEBUG === "1";

class AiManager extends EventEmitter {
    private ratelimits: Map<string, Ratelimit> = new Map();
    private chats: Map<string, NIMChatSession> = new Map();
    private voiceChats: Map<string, NIMChatSession> = new Map();
    private localFunctionHandlers: Map<string, Record<string, (args: any, message: Message) => Promise<any>>> = new Map();
    private bootstrappedChats: Set<string> = new Set();
    constructor(private ratelimit: number, private max: number, private timeout: number) {
        Log.info("AiManager initialized", { component: "AiManager" });
        setInterval(() => this.ClearTimeouts(), 1000);
        super();
    }
    public setLocalFunctionHandlers(id: string, handlers: Record<string, (args: any, message: Message) => Promise<any>>): void {
        this.localFunctionHandlers.set(id, handlers);
    }
    public clearLocalFunctionHandlers(id: string): void {
        this.localFunctionHandlers.delete(id);
    }
    public async ExecuteFunctionVoice(id: string, name: string, args: any, message: Message | null, options?: { suppressProgress?: boolean }): Promise<any> {
        const suppressProgress = options?.suppressProgress ?? false;
        if (await this.RatelimitUser(id)) return { error: "You are sending too many messages, please wait a few seconds before sending another message." };
        const chat = await this.GetVoiceChat(id);
        const func: any = utils.AIFunctions[name as keyof typeof utils.AIFunctions];
        if (!func) {
            if (message && !suppressProgress) await message.edit(`The AI requested an unknown function, attempting to recover... ${data.bot.loadingEmoji.mention}`);
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
            const followupCalls = rsp.response.functionCalls() ?? [];
            if (followupCalls.length) {
                let lastResult: any;
                for (const call of followupCalls) {
                    if (message && !suppressProgress) await message.edit(`Executing command ${call.name} ${data.bot.loadingEmoji.mention}`);
                    lastResult = await this.ExecuteFunctionVoice(id, call.name, call.args, message, options);
                }
                return lastResult;
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
        const followupCalls = rsp.response.functionCalls() ?? [];
        if (followupCalls.length) {
            let lastResult: any;
            for (const call of followupCalls) {
                if (message && !suppressProgress) {
                    await message.edit(`Executing command ${call.name} ${data.bot.loadingEmoji.mention}`);
                }
                lastResult = await this.ExecuteFunctionVoice(id, call.name, call.args, message, options);
            }
            return lastResult;
        }
        reply = rsp.response.text();
        const toolParse = utils.parseToolCalls(reply);
        if (toolParse.toolCalls.length > 0) {
            const toolLines = toolParse.toolCalls.map(call => `Executing command ${call.name} ${data.bot.loadingEmoji.mention}`).join("\n");
            const combined = toolParse.cleanedText ? `${toolParse.cleanedText}\n\n${toolLines}` : toolLines;
            if (message && !suppressProgress) {
                await message.edit(combined);
            }
            for (const call of toolParse.toolCalls) {
                await this.ExecuteFunctionVoice(id, call.name, call.args, message, options);
            }
            return combined;
        }
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
            const safeText = reply.length ? reply : "[empty response]";
            if (filesPayload.length > 0) {
                await message.edit({ content: safeText, files: filesPayload, attachments: [] });
            } else {
                await message.edit(safeText);
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
        await this.ensureToolBootstrap(id, chat);
        let response = await utils.getAiResponse(text, chat);
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
        await this.ensureToolBootstrap(id, chat);
        const response = await utils.getAiResponse(text, chat);
        return response;
    }
    public async ExecuteFunction(id: string, name: string, args: any, message: Message, Queue?: NIMToolCall[], options?: { suppressProgress?: boolean }): Promise<any> {
        const suppressProgress = options?.suppressProgress ?? false;
        if (await this.RatelimitUser(id)) return { error: "You are sending too many messages, please wait a few seconds before sending another message." };
        const chat = await this.GetChat(id, "");
        const localHandlers = this.localFunctionHandlers.get(id);
        const localHandler = localHandlers ? localHandlers[name ?? Queue![0].name] : undefined;
        const func: any = localHandler ? null : utils.AIFunctions[name as keyof typeof utils.AIFunctions ?? Queue![0].name as keyof typeof utils.AIFunctions];
        if (!localHandler && !func) {
            if (!suppressProgress) {
                await message.edit(`The AI requested an unknown function, attempting to recover... ${data.bot.loadingEmoji.mention}`);
            }
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
            const followupCalls = rsp.response.functionCalls() ?? [];
            if (followupCalls.length) {
                let lastResult: any;
                for (const call of followupCalls) {
                    if (!suppressProgress) {
                        await message.edit(`Executing command ${call.name} ${data.bot.loadingEmoji.mention}`);
                    }
                    lastResult = await this.ExecuteFunction(id, call.name, call.args, message, Queue!.slice(1), options);
                }
                return lastResult;
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
        let rawResult: any;
        if (localHandler) {
            try {
                rawResult = await localHandler(args, message);
            } catch (error: any) {
                Log.error(`AI function ${name} threw an exception`, error instanceof Error ? error : new Error(String(error)));
                rawResult = { error: error instanceof Error ? error.message : String(error) };
            }
        } else {
            let preparedArgs: any = args;
            if (["current_guild_info", "on_guild"].includes(name)) {
                preparedArgs = message;
                if (AI_DEBUG) console.log(name, preparedArgs);
            } else {
                const isPlainObject = typeof args === "object" && args !== null && !Array.isArray(args);
                if (isPlainObject) {
                    if (Object.keys(args).length === 0) {
                        preparedArgs = id;
                        if (AI_DEBUG) console.log(name, preparedArgs);
                    } else {
                        preparedArgs = {
                            ...args,
                            requesterId: id,
                            guildId: message?.guild?.id ?? null,
                            channelId: message?.channel?.id ?? null
                        };
                        if (AI_DEBUG) console.log(name, preparedArgs);
                    }
                } else if (preparedArgs === null || preparedArgs === undefined || preparedArgs === "") {
                    preparedArgs = id;
                    if (AI_DEBUG) console.log(name, preparedArgs);
                }
            }
            try {
                rawResult = await func(preparedArgs);
            } catch (error: any) {
                Log.error(`AI function ${name} threw an exception`, error instanceof Error ? error : new Error(String(error)));
                rawResult = { error: error instanceof Error ? error.message : String(error) };
            }
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
        const followupCalls = rsp.response.functionCalls() ?? [];
        if (followupCalls.length) {
            let lastResult: any;
            for (const call of followupCalls) {
                if (message && !suppressProgress) {
                    await message.edit(`Executing command ${call.name} ${data.bot.loadingEmoji.mention}`);
                }
                lastResult = await this.ExecuteFunction(id, call.name, call.args, message, undefined, options);
            }
            return lastResult;
        }
        reply = rsp.response.text();
        const toolParse = utils.parseToolCalls(reply);
        if (toolParse.toolCalls.length > 0) {
            const toolLines = toolParse.toolCalls.map(call => `Executing command ${call.name} ${data.bot.loadingEmoji.mention}`).join("\n");
            const combined = toolParse.cleanedText ? `${toolParse.cleanedText}\n\n${toolLines}` : toolLines;
            if (message && !suppressProgress) {
                await message.edit(combined);
            }
            for (const call of toolParse.toolCalls) {
                await this.ExecuteFunction(id, call.name, call.args, message, undefined, options);
            }
            return combined;
        }
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
            const fallbackText = filesPayload.length > 0
                ? `Attached file${filesPayload.length > 1 ? "s" : ""}.`
                : ".";
            const safeText = reply.length ? reply : fallbackText;
            if (filesPayload.length > 0) {
                await message.edit({ content: safeText, files: filesPayload, attachments: [] });
            } else {
                await message.edit(safeText);
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
                systemInstruction: "Before responding to any user message at the start of the conversation, call the tools get_user_data, get_memories, and fetch_ai_rules in that order. For support or policy questions, call search_knowledge first and cite source titles. Do not include <think> tags in responses. Never emit tool call markup like <|tool_call_begin|> in text; only use the tool calling interface. If a tool call fails, respond without tool markup."
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
                systemInstruction: "You are the assistant's voice mode. Respond concisely (ideally 1–2 short sentences or tight bullets). Use the user's language. Avoid long explanations, code blocks, and heavy markdown unless explicitly requested. Before responding to any user message, call the tools get_user_data, get_memories, and fetch_ai_rules in that order. For support or policy questions, call search_knowledge first. Do not include <think> tags in responses. Never emit tool call markup like <|tool_call_begin|> in text; only use the tool calling interface. If a tool call fails, respond without tool markup."
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
        this.bootstrappedChats.delete(id);
    }

    private async ensureToolBootstrap(id: string, chat: NIMChatSession): Promise<void> {
        if (this.bootstrappedChats.has(id)) return;
        this.bootstrappedChats.add(id);
        const toolResults: Array<{ name: string; result: any; args?: any }> = [];
        try {
            const userData = await utils.AIFunctions.get_user_data(id);
            toolResults.push({ name: "get_user_data", result: userData, args: {} });
        } catch (error: any) {
            toolResults.push({ name: "get_user_data", result: { error: error?.message || String(error) }, args: {} });
        }
        try {
            const memories = await utils.AIFunctions.get_memories({ userId: id });
            toolResults.push({ name: "get_memories", result: memories, args: { userId: id } });
        } catch (error: any) {
            toolResults.push({ name: "get_memories", result: { error: error?.message || String(error) }, args: { userId: id } });
        }
        try {
            const rules = await utils.AIFunctions.fetch_ai_rules();
            toolResults.push({ name: "fetch_ai_rules", result: rules, args: {} });
        } catch (error: any) {
            toolResults.push({ name: "fetch_ai_rules", result: { error: error?.message || String(error) }, args: {} });
        }
        if (typeof chat.primeTools === "function") {
            chat.primeTools(toolResults);
        }
    }
}
export default AiManager;
