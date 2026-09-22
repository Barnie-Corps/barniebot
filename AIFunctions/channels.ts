import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const channelsDeclarations = {
    on_guild: {
        name: "on_guild",
        description: "Check if the current chat is taking place in a guild (server) or in a private message. This can help tailor responses based on the context of the conversation.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    guild_info: {
        name: "guild_info",
        description: "Fetches information about a guild (server) based on its ID. This can be useful for retrieving details such as the guild's name, member count, and other relevant information.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING }
            },
            required: ["guildId"]
        }
    },
    current_guild_info: {
        name: "current_guild_info",
        description: "Fetches information about the current guild (server) where the conversation is taking place. This can be useful for retrieving details such as the guild's name, member count, and other relevant information. Avoid using this in DMs.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {}
        }
    },
    get_member_permissions: {
        name: "get_member_permissions",
        description: "Get the permissions of a member in a guild. This can help determine what actions the member is allowed to perform within the guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING }
            },
            required: ["guildId", "memberId"]
        }
    },
    get_member_roles: {
        name: "get_member_roles",
        description: "Get the roles of a member in a guild. This can help determine the member's status and privileges within the guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING }
            },
            required: ["guildId", "memberId"]
        }
    },
    list_guild_channels: {
        name: "list_guild_channels",
        description: "List channels in a guild. Requires ManageChannels permission in that guild and admin+ staff or owner.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                type: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            },
            required: ["guildId"]
        }
    },
    search_guild_channels: {
        name: "search_guild_channels",
        description: "Search channels by name in a guild. Requires ManageChannels permission in that guild and admin+ staff or owner.",
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
    get_channel_info: {
        name: "get_channel_info",
        description: "Get detailed channel info (including type) in a guild. Requires ManageChannels permission in that guild and admin+ staff or owner.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                channelId: { type: SchemaType.STRING }
            },
            required: ["guildId", "channelId"]
        }
    },
    get_current_channel_info: {
        name: "get_current_channel_info",
        description: "Get detailed info of the current channel (including type) in a guild. Requires ManageChannels permission in that guild and admin+ staff or owner. Avoid using this in DMs.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {},
        }
    },
    create_guild_channel: {
        name: "create_guild_channel",
        description: "Create a channel in a guild. Requires ManageChannels permission in that guild and admin+ staff or owner.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                name: { type: SchemaType.STRING },
                type: { type: SchemaType.STRING },
                parentId: { type: SchemaType.STRING },
                topic: { type: SchemaType.STRING },
                nsfw: { type: SchemaType.BOOLEAN },
                rateLimitPerUser: { type: SchemaType.NUMBER },
                bitrate: { type: SchemaType.NUMBER },
                userLimit: { type: SchemaType.NUMBER },
                reason: { type: SchemaType.STRING }
            },
            required: ["guildId", "name", "type"]
        }
    },
    edit_guild_channel: {
        name: "edit_guild_channel",
        description: "Edit a channel's settings in a guild. Requires ManageChannels permission in that guild and admin+ staff or owner.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                channelId: { type: SchemaType.STRING },
                name: { type: SchemaType.STRING },
                topic: { type: SchemaType.STRING },
                nsfw: { type: SchemaType.BOOLEAN },
                rateLimitPerUser: { type: SchemaType.NUMBER },
                parentId: { type: SchemaType.STRING },
                position: { type: SchemaType.NUMBER },
                userLimit: { type: SchemaType.NUMBER },
                bitrate: { type: SchemaType.NUMBER },
                reason: { type: SchemaType.STRING }
            },
            required: ["guildId", "channelId"]
        }
    },
    delete_guild_channel: {
        name: "delete_guild_channel",
        description: "Delete a channel in a guild. Requires ManageChannels permission in that guild and admin+ staff or owner.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                channelId: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
            },
            required: ["guildId", "channelId"]
        }
    },
    create_thread: {
        name: "create_thread",
        description: "Create a thread inside a channel. Requires thread creation permission in that guild and admin+ staff or owner.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                channelId: { type: SchemaType.STRING },
                name: { type: SchemaType.STRING },
                type: { type: SchemaType.STRING },
                autoArchiveDuration: { type: SchemaType.NUMBER },
                reason: { type: SchemaType.STRING }
            },
            required: ["guildId", "channelId", "name"]
        }
    },
    send_channel_message: {
        name: "send_channel_message",
        description: "Send a message to a specific channel. Requires SendMessages permission in that guild and admin+ staff or owner.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                channelId: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING }
            },
            required: ["guildId", "channelId", "content"]
        }
    },
    send_channel_embed: {
        name: "send_channel_embed",
        description: "Send an embed message to a specific channel. Requires SendMessages permission in that guild and admin+ staff or owner.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                channelId: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING },
                embed: { type: SchemaType.OBJECT }
            },
            required: ["guildId", "channelId", "embed"]
        }
    },
    set_channel_permissions: {
        name: "set_channel_permissions",
        description: "Modify channel permission overwrites. Requires ManageChannels permission in that guild and admin+ staff or owner.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                channelId: { type: SchemaType.STRING },
                targetId: { type: SchemaType.STRING },
                allow: { type: SchemaType.ARRAY },
                deny: { type: SchemaType.ARRAY }
            },
            required: ["guildId", "channelId", "targetId"]
        }
    },
    send_email: {
        name: "send_email",
        description: "Sends an email to a specified recipient. Requires staff authorization; staff/owners can send immediately, others require staff confirmation. Only one recipient is allowed and some domains are blocked. Body can be plain text or HTML.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                to: { type: SchemaType.STRING },
                subject: { type: SchemaType.STRING },
                body: { type: SchemaType.STRING },
                isHtml: { type: SchemaType.BOOLEAN }
            },
            required: ["to", "subject", "body", "isHtml"]
        }
    },

} satisfies Record<string, FunctionDeclaration>;

export default channelsDeclarations;
