import utils from "./utils";
import type { FunctionDeclaration, OpenAIToolDefinition, SchemaType } from "./AIFunctions";

export type AIMonitorToolName =
    | "fetch_url_safe"
    | "fetch_discord_user"
    | "search_user_by_username_discord"
    | "get_user_warnings"
    | "get_warning_details"
    | "get_message_context"
    | "get_user_context"
    | "get_guild_context"
    | "get_user_case_history"
    | "get_channel_case_history"
    | "get_guild_audit_events"
    | "get_member_safety_profile";

const functionDeclarations: Record<AIMonitorToolName, FunctionDeclaration> = {
    fetch_url_safe: {
        name: "fetch_url_safe",
        description: "Safely fetches a URL with strict limits. Text-only, size capped, and redirects blocked. Use this for investigating suspicious links.",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                url: { type: "string" as SchemaType, description: "The URL to fetch content from." },
                maxChars: { type: "number" as SchemaType, description: "Maximum characters to return (default 50000, max 50000)." },
                timeoutMs: { type: "number" as SchemaType, description: "Timeout in milliseconds (default 4000, max 8000)." }
            },
            required: ["url"]
        }
    },
    fetch_discord_user: {
        name: "fetch_discord_user",
        description: "Fetches Discord user information based on their user ID. (Use this command if you want info not available in the database).",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                userId: { type: "string" as SchemaType }
            },
            required: ["userId"]
        }
    },
    search_user_by_username_discord: {
        name: "search_user_by_username_discord",
        description: "Searches for a Discord user by their username. Displays the first 20 matches with their IDs.",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                username: { type: "string" as SchemaType }
            },
            required: ["username"]
        }
    },
    get_user_warnings: {
        name: "get_user_warnings",
        description: "Get all warnings for a specific user, including active, expired, and appealed warnings.",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                userId: { type: "string" as SchemaType }
            },
            required: ["userId"]
        }
    },
    get_warning_details: {
        name: "get_warning_details",
        description: "Get detailed information about a specific warning by its ID.",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                warningId: { type: "number" as SchemaType }
            },
            required: ["warningId"]
        }
    },
    get_message_context: {
        name: "get_message_context",
        description: "Get message context (target message and nearby messages) for investigation. Intended for AI monitor use.",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                guildId: { type: "string" as SchemaType },
                channelId: { type: "string" as SchemaType },
                messageId: { type: "string" as SchemaType },
                limit: { type: "number" as SchemaType }
            },
            required: ["guildId", "channelId", "messageId"]
        }
    },
    get_user_context: {
        name: "get_user_context",
        description: "Get user context in a guild for investigation (account age, roles, permissions). Intended for AI monitor use.",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                guildId: { type: "string" as SchemaType },
                userId: { type: "string" as SchemaType }
            },
            required: ["guildId", "userId"]
        }
    },
    get_guild_context: {
        name: "get_guild_context",
        description: "Get guild context for investigation (settings, counts, recent invites if permitted). Intended for AI monitor use.",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                guildId: { type: "string" as SchemaType }
            },
            required: ["guildId"]
        }
    },
    get_user_case_history: {
        name: "get_user_case_history",
        description: "Get recent AI monitor cases for a specific user in a guild.",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                guildId: { type: "string" as SchemaType },
                userId: { type: "string" as SchemaType },
                days: { type: "number" as SchemaType, description: "Lookback window in days (default 7, max 30)." },
                limit: { type: "number" as SchemaType, description: "Maximum cases to return (default 10, max 25)." }
            },
            required: ["guildId", "userId"]
        }
    },
    get_channel_case_history: {
        name: "get_channel_case_history",
        description: "Get recent AI monitor cases for a specific channel in a guild.",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                guildId: { type: "string" as SchemaType },
                channelId: { type: "string" as SchemaType },
                hours: { type: "number" as SchemaType, description: "Lookback window in hours (default 24, max 168)." },
                limit: { type: "number" as SchemaType, description: "Maximum cases to return (default 10, max 25)." }
            },
            required: ["guildId", "channelId"]
        }
    },
    get_guild_audit_events: {
        name: "get_guild_audit_events",
        description: "Fetch recent guild audit log events for investigation.",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                guildId: { type: "string" as SchemaType },
                actionType: { type: "string" as SchemaType, description: "Optional Discord audit log action type numeric value." },
                userId: { type: "string" as SchemaType, description: "Optional executor user ID filter." },
                limit: { type: "number" as SchemaType, description: "Maximum audit entries to return (default 10, max 25)." }
            },
            required: ["guildId"]
        }
    },
    get_member_safety_profile: {
        name: "get_member_safety_profile",
        description: "Get compact member risk profile from account age, warnings, recent monitor cases, and moderation state.",
        parameters: {
            type: "object" as SchemaType,
            properties: {
                guildId: { type: "string" as SchemaType },
                userId: { type: "string" as SchemaType }
            },
            required: ["guildId", "userId"]
        }
    }
};

const AIMonitorFunctionDeclarations = Object.values(functionDeclarations);

export const getAiMonitorTools = (): OpenAIToolDefinition[] => {
    return AIMonitorFunctionDeclarations.map(fn => ({
        type: "function",
        function: fn
    }));
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
            requesterId: args.requesterId ?? context?.requesterId ?? "__ai_monitor__"
        };
    }
    try {
        return await func(preparedArgs);
    } catch (error: any) {
        return { error: error?.message || String(error) };
    }
};
