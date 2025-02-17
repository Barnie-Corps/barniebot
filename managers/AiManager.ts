import EventEmitter from "events";
import { Ratelimit } from "../types/interfaces";
import db from "../mysql/database";
import utils from "../utils";
import { ChatSession, GoogleGenerativeAI } from "@google/generative-ai";
import Log from "../Log";
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
    private async GetHistory(id: string): Promise<any> {
        const history: any = await db.query("SELECT * FROM ai_history WHERE uid = ?", [id]);
        let hdata = history[0] ? JSON.parse(history[0].content).data : null;
        return hdata;
    }
    public async GetResponse(id: string, text: string): Promise<string> {
        if (await this.RatelimitUser(id)) return "You are sending too many messages, please wait a few seconds before sending another message.";
        const chat = await this.GetChat(id, text);
        const response = await utils.getAiResponse(text, chat);
        const hdata = await this.GetHistory(id);
        hdata.push({ parts: [{ text }], role: "user" });
        hdata.push({ parts: [{ text: response }], role: "model" });
        await this.UpdateHistory(id, hdata);
        return response;
    }
    // text param is used in case the user has no history
    private async GetChat(id: string, text: string): Promise<ChatSession> {
        let chat = this.chats.get(id);
        let hdata = await this.GetHistory(id);
        if (!hdata) {
            db.query("INSERT INTO ai_history SET ? ", [{
                content: JSON.stringify({ data: [{ parts: [{ text }], role: "user" }] }),
                uid: id
            }]);
        };
        if (!chat) {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            chat = model.startChat({
                history: hdata,
                generationConfig: {
                    maxOutputTokens: 480,
                    temperature: 0.9,
                    topP: 0.9,
                    topK: 40,
                }
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
    private async UpdateHistory(id: string, data: any): Promise<void> {
        db.query("UPDATE ai_history SET ? WHERE uid = ?", [{
            content: JSON.stringify({ data }),
        }, id]);
    }
    public async ClearHistory(id: string): Promise<void> {
        await db.query("DELETE FROM ai_history WHERE uid = ?", [{
            content: JSON.stringify({ data: [] }),
        }, id]);
    }
}
export default AiManager;