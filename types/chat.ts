export interface QueuedMessage {
    message: import("discord.js").Message<true>;
    priority: number;
    timestamp: number;
}
