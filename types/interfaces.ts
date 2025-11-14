import { Collection, Message, MessagePayload } from "discord.js";
export interface DataType {
    database: {
        host: string;
        user: string;
        password: string;
        port?: number;
        database: string;
    };
    bot: {
        owners: string[];
        emojis: BotEmoji[];
        loadingEmoji: {
            id: string;
            mention: string;
            name: string;
        };
        token: string;
        commands: Collection<string, any>;
        encryption_key: string;
        log_channel: string;
        home_guild: string;
        support_category: string;
        transcripts_channel: string;
    }
}
export interface BotEmoji {
    emoji: string;
    name: string;
    id: string;
}

export interface ChatManagerOptions {
    ratelimit_time: number;
    messages_limit: number;
    time: number
}
export interface Ratelimit {
    id: string;
    time: number;
    messages: number;
}