// AI tool declarations: Slowmode, message search, invites, webhooks, threads, scheduled events, emojis/stickers, pins, giveaways, reminders, and local-model status.
import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const guildToolsDeclarations = {
    set_slowmode: {
        name: "set_slowmode",
        description: "Set the slowmode delay on a text channel. Requires ManageChannels permission.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                channelId: { type: SchemaType.STRING, description: "The channel to set slowmode on." },
                delay: { type: SchemaType.NUMBER, description: "Slowmode delay in seconds (0 to disable, max 21600)." },
                reason: { type: SchemaType.STRING, description: "Optional reason for the audit log." }
            },
            required: ["channelId", "delay"]
        }
    },
    search_messages: {
        name: "search_messages",
        description: "Search for messages in a channel by text content. Requires ReadMessageHistory permission.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                channelId: { type: SchemaType.STRING, description: "The channel to search in." },
                query: { type: SchemaType.STRING, description: "Text to search for in message content." },
                limit: { type: SchemaType.NUMBER, description: "Max messages to return (default 25, max 100)." },
                before: { type: SchemaType.STRING, description: "Only find messages before this message ID." },
                after: { type: SchemaType.STRING, description: "Only find messages after this message ID." }
            },
            required: ["channelId", "query"]
        }
    },
    list_invites: {
        name: "list_invites",
        description: "List all invites in a guild or a specific channel. Requires ManageGuild permission.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING, description: "The guild to list invites for." },
                channelId: { type: SchemaType.STRING, description: "Optional: list invites for a specific channel only." }
            },
            required: ["guildId"]
        }
    },
    create_invite: {
        name: "create_invite",
        description: "Create an invite link for a channel. Requires CreateInstantInvite permission.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                channelId: { type: SchemaType.STRING, description: "The channel to create an invite for." },
                maxAge: { type: SchemaType.NUMBER, description: "Invite lifetime in seconds (default 86400, 0 for never)." },
                maxUses: { type: SchemaType.NUMBER, description: "Max number of uses (default 0 for unlimited)." },
                temporary: { type: SchemaType.BOOLEAN, description: "Whether the invite grants temporary membership." },
                reason: { type: SchemaType.STRING, description: "Optional reason for the audit log." }
            },
            required: ["channelId"]
        }
    },
    list_webhooks: {
        name: "list_webhooks",
        description: "List all webhooks in a guild or a specific channel. Requires ManageWebhooks permission.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING, description: "The guild to list webhooks for." },
                channelId: { type: SchemaType.STRING, description: "Optional: list webhooks for a specific channel only." }
            },
            required: ["guildId"]
        }
    },
    create_webhook: {
        name: "create_webhook",
        description: "Create a webhook in a channel. Requires ManageWebhooks permission.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                channelId: { type: SchemaType.STRING, description: "The channel to create the webhook in." },
                name: { type: SchemaType.STRING, description: "Webhook name." },
                avatar: { type: SchemaType.STRING, description: "Optional URL for the webhook avatar image." },
                reason: { type: SchemaType.STRING, description: "Optional reason for the audit log." }
            },
            required: ["channelId", "name"]
        }
    },
    manage_thread: {
        name: "manage_thread",
        description: "Manage a thread: archive, unarchive, lock, unlock, or rename. Requires ManageThreads permission.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                channelId: { type: SchemaType.STRING, description: "The thread channel ID." },
                action: { type: SchemaType.STRING, description: "Action to perform: archive, unarchive, lock, unlock, rename." },
                name: { type: SchemaType.STRING, description: "New name for the thread (only used with rename action)." },
                reason: { type: SchemaType.STRING, description: "Optional reason for the audit log." }
            },
            required: ["channelId", "action"]
        }
    },
    manage_scheduled_event: {
        name: "manage_scheduled_event",
        description: "Create, list, or delete scheduled events in a guild. Requires ManageEvents permission.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING, description: "The guild ID." },
                action: { type: SchemaType.STRING, description: "Action: create, list, delete, get." },
                name: { type: SchemaType.STRING, description: "Event name (required for create)." },
                channelId: { type: SchemaType.STRING, description: "Channel ID for stage/voice events (required for create)." },
                startTime: { type: SchemaType.STRING, description: "Event start time in ISO 8601 (required for create)." },
                description: { type: SchemaType.STRING, description: "Event description." },
                location: { type: SchemaType.STRING, description: "Location name for external events (if no channelId)." },
                eventId: { type: SchemaType.STRING, description: "Event ID (required for delete/get)." }
            },
            required: ["guildId", "action"]
        }
    },
    list_emojis: {
        name: "list_emojis",
        description: "List all custom emojis in a guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING, description: "The guild to list emojis for." }
            },
            required: ["guildId"]
        }
    },
    list_stickers: {
        name: "list_stickers",
        description: "List all custom stickers in a guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING, description: "The guild to list stickers for." }
            },
            required: ["guildId"]
        }
    },
    manage_pin: {
        name: "manage_pin",
        description: "Pin or unpin a message in a channel. Requires ManageMessages permission.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                channelId: { type: SchemaType.STRING, description: "The channel the message is in." },
                messageId: { type: SchemaType.STRING, description: "The message ID to pin or unpin." },
                action: { type: SchemaType.STRING, description: "Action: pin or unpin." }
            },
            required: ["channelId", "messageId", "action"]
        }
    },
    manage_giveaway: {
        name: "manage_giveaway",
        description: "Start, end, reroll, or list giveaways in the current guild. Requires Manage Guild permission (or staff/owner). Use 'start' to create a giveaway in a channel, 'end' to end one early and pick winners, 'reroll' to pick a new winner for an already-ended giveaway (excluding previous winners), and 'list' to see active giveaways.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                action: { type: SchemaType.STRING, description: "One of: start, end, reroll, list." },
                channelId: { type: SchemaType.STRING, description: "Channel to post the giveaway in (for 'start'). Defaults to the current channel if omitted." },
                giveawayId: { type: SchemaType.NUMBER, description: "The giveaway's numeric ID (for 'end' and 'reroll')." },
                prize: { type: SchemaType.STRING, description: "What is being given away (for 'start')." },
                description: { type: SchemaType.STRING, description: "Optional extra description shown on the giveaway embed (for 'start')." },
                durationMs: { type: SchemaType.NUMBER, description: "How long the giveaway should run, in milliseconds (for 'start'). Minimum 60000 (1 minute), maximum 2592000000 (30 days)." },
                winnerCount: { type: SchemaType.NUMBER, description: "Number of winners to pick, 1-25 (for 'start'). Defaults to 1." }
            },
            required: ["action"]
        }
    },
    create_reminder: {
        name: "create_reminder",
        description: "Set a personal reminder for the requesting user. They will be DMed the reminder message when it's due. Only ever set a reminder for the user currently talking to you, using their own requester ID -- never for another user.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                message: { type: SchemaType.STRING, description: "What to remind the user about." },
                durationMs: { type: SchemaType.NUMBER, description: "How long from now to send the reminder, in milliseconds. Minimum 30000 (30 seconds), maximum 2592000000 (30 days)." }
            },
            required: ["message", "durationMs"]
        }
    },
    check_local_model: {
        name: "check_local_model",
        description: "Check if Ollama is running and get status of local AI models. Returns health, available models, and configured models.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {},
        }
    },
    list_local_models: {
        name: "list_local_models",
        description: "List all models currently available on the local Ollama server, including model sizes and sizes.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {},
        }
    }

} satisfies Record<string, FunctionDeclaration>;

export default guildToolsDeclarations;
