import utils from "./utils";
import AIFunctions from "./AIFunctions";

export type AIMonitorToolName = "fetch_url_safe" | "fetch_discord_user" | "search_user_by_username_discord" | "get_user_warnings" | "get_warning_details";

const allowlist = new Set<AIMonitorToolName>([
    "fetch_url_safe",
    "fetch_discord_user",
    "search_user_by_username_discord",
    "get_user_warnings",
    "get_warning_details",
]);

export const getAiMonitorTools = () => {
    return AIFunctions.filter(tool => allowlist.has(tool.function.name as AIMonitorToolName));
};

export const executeAiMonitorTool = async (name: AIMonitorToolName, args: any, context?: { guildId?: string | null; requesterId?: string | null }) => {
    const func: any = utils.AIFunctions[name as keyof typeof utils.AIFunctions];
    if (!func) return { error: "Unknown function" };
    let preparedArgs: any = args;
    const isPlainObject = typeof args === "object" && args !== null && !Array.isArray(args);
    if (isPlainObject) {
        preparedArgs = {
            ...args,
            guildId: args.guildId ?? context?.guildId ?? null,
            requesterId: args.requesterId ?? context?.requesterId ?? null
        };
    }
    try {
        return await func(preparedArgs);
    } catch (error: any) {
        return { error: error?.message || String(error) };
    }
};
