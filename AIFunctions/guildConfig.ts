// AI tool declarations: Guild feature configuration lookups: filters, custom responses, global chat, AI monitor.
import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const guildConfigDeclarations = {
    get_filter_config: {
        name: "get_filter_config",
        description: "Get the word filter configuration for a specific guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    get_filter_words: {
        name: "get_filter_words",
        description: "Get all filtered words for a specific guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    get_filter_webhooks: {
        name: "get_filter_webhooks",
        description: "Get filter webhook entries for a specific guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    get_custom_responses: {
        name: "get_custom_responses",
        description: "Get all custom command responses configured for a specific guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    get_custom_response: {
        name: "get_custom_response",
        description: "Get a specific custom response by command for a guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                command: { type: SchemaType.STRING }
            },
            required: ["guildId", "command"]
        }
    },
    search_custom_responses: {
        name: "search_custom_responses",
        description: "Search custom responses by command or response text for a guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                query: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            },
            required: ["guildId", "query"]
        }
    },
    get_globalchat_config: {
        name: "get_globalchat_config",
        description: "Get the global chat configuration for a specific guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    get_ai_monitor_config: {
        name: "get_ai_monitor_config",
        description: "Get the AI monitor configuration for a specific guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    list_ai_monitor_cases: {
        name: "list_ai_monitor_cases",
        description: "List AI monitor cases for a guild, optionally filtered by status or user.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                status: { type: SchemaType.STRING },
                userId: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            },
            required: ["guildId"]
        }
    },
    get_ai_monitor_case: {
        name: "get_ai_monitor_case",
        description: "Get a single AI monitor case by case ID.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                caseId: { type: SchemaType.STRING }
            },
            required: ["caseId"]
        }
    },

} satisfies Record<string, FunctionDeclaration>;

export default guildConfigDeclarations;
