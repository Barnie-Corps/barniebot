import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const moderationDeclarations = {
    get_user_warnings: {
        name: "get_user_warnings",
        description: "Get all warnings for a specific user, including active, expired, and appealed warnings.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    get_warning_details: {
        name: "get_warning_details",
        description: "Get detailed information about a specific warning by its ID.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                warningId: { type: SchemaType.NUMBER }
            },
            required: ["warningId"]
        }
    },
    appeal_warning: {
        name: "appeal_warning",
        description: "Submit an appeal for a warning. User can only appeal their own warnings.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                warningId: { type: SchemaType.NUMBER },
                reason: { type: SchemaType.STRING }
            },
            required: ["userId", "warningId", "reason"]
        }
    },
    get_pending_appeals: {
        name: "get_pending_appeals",
        description: "Get all pending warning appeals. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    review_appeal: {
        name: "review_appeal",
        description: "Review and approve or reject a warning appeal. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                warningId: { type: SchemaType.NUMBER },
                approved: { type: SchemaType.BOOLEAN },
                reviewNote: { type: SchemaType.STRING }
            },
            required: ["warningId", "approved"]
        }
    },
    global_ban_user: {
        name: "global_ban_user",
        description: "Ban a user globally from using bot features. Staff-only command. Records action in audit log.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    global_unban_user: {
        name: "global_unban_user",
        description: "Remove a global ban from a user. Staff-only command. Records action in audit log.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    global_mute_user: {
        name: "global_mute_user",
        description: "Mute a user globally from sending messages in global chat. Duration in milliseconds (0 for permanent). Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                duration: { type: SchemaType.NUMBER },
                reason: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    global_unmute_user: {
        name: "global_unmute_user",
        description: "Remove a global mute from a user. Staff-only command. Records action in audit log.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    get_global_ban_status: {
        name: "get_global_ban_status",
        description: "Check if a user is globally banned and how many times they've been banned.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    get_global_mute_status: {
        name: "get_global_mute_status",
        description: "Check if a user is globally muted, the reason, and when the mute expires.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },

} satisfies Record<string, FunctionDeclaration>;

export default moderationDeclarations;
