import EventEmitter from "events";
import { Ratelimit } from "../types/interfaces";
import db from "../mysql/database";
import utils from "../utils";
import { ChatSession, GoogleGenerativeAI } from "@google/generative-ai";
import Log from "../Log";
import AIFunctions from "../AIFunctions";
import { Message } from "discord.js";
import * as fs from "fs";
const genAI = new GoogleGenerativeAI(String(process.env.AI_API_KEY));

class AiManager extends EventEmitter {
    private ratelimits: Map<string, Ratelimit> = new Map();
    private chats: Map<string, ChatSession> = new Map();
    constructor(private ratelimit: number, private max: number, private timeout: number) {
        Log.info("AiManager initialized", { component: "AiManager" });
        setInterval(() => this.ClearTimeouts(), 1000);
        super();
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
        const tempChat = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }).startChat({
            history: [],
            generationConfig: {
                maxOutputTokens: 480,
                temperature: 0.9,
                topP: 0.9,
                topK: 40,
            }
        });
        const response = await utils.getAiResponse(text, tempChat);
        return response.text;
    }
    public async ExecuteFunction(id: string, name: string, args: any, message: Message): Promise<any> {
        if (await this.RatelimitUser(id)) return { error: "You are sending too many messages, please wait a few seconds before sending another message." };
        const chat = await this.GetChat(id, "");
        const func: any = utils.AIFunctions[name as keyof typeof utils.AIFunctions];
        if (!func) {
            await message.edit("The AI requested an unknown function, attempting to recover... <a:discordproloading:875107406462472212>");
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
                await message.edit(`Executing command ${(rsp.response.functionCalls() as any)[0].name} <a:discordproloading:875107406462472212>`);
                return this.ExecuteFunction(id, (rsp.response.functionCalls() as any)[0].name, (rsp.response.functionCalls() as any)[0].args, message);
            }
        }
        if (!Object.keys(args).length) args = id;
        if (["current_guild_info", "on_guild"].includes(name)) args = message;
        console.log(func, name, args);
        const data = await func(args);
        let reply = "";
        const rsp = await chat.sendMessage([
            {
                functionResponse: {
                    name,
                    response: {
                        result: data
                    }
                }
            }
        ]);
        if (rsp.response.functionCalls()?.length) {
            await message.edit(`Executing command ${(rsp.response.functionCalls() as any)[0].name} <a:discordproloading:875107406462472212>`);
            return this.ExecuteFunction(id, (rsp.response.functionCalls() as any)[0].name, (rsp.response.functionCalls() as any)[0].args, message);
        }
        reply = rsp.response.text();
        if (reply.length > 2000) {
            const filename = `./ai-response-${Date.now()}.md`;
            fs.writeFileSync(filename, reply);
            await message.edit({ content: "The response from the AI was too long, so it has been sent as a file.", files: [filename] });
            return;
        }
        await message.edit(reply);
        return;
    }
    // text param is used in case the user has no history
    private async GetChat(id: string, text: string): Promise<ChatSession> {
        let chat = this.chats.get(id);
        if (!chat) {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            chat = model.startChat({
                generationConfig: {
                    maxOutputTokens: 480,
                    temperature: 0.9,
                    topP: 0.9,
                    topK: 40,
                },
                tools: AIFunctions
            });
            this.chats.set(id, chat);
        }
        return this.chats.get(id) as ChatSession;
    }
    private ClearTimeouts(): void {
        this.ratelimits.forEach((ratelimit) => {
            if (Date.now() - ratelimit.time > this.timeout) this.ratelimits.delete(ratelimit.id);
        });
    }

    public async ClearChat(id: string): Promise<void> {
        this.chats.delete(id);
    }
}
export default AiManager;