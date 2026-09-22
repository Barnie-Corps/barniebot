// AI tool declarations: Member and role management: lookup, roles, kicks, bans, timeouts, nicknames, voice moves.
import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const membersDeclarations = {
    kick_member: {
        name: "kick_member",
        description: "Kicks a member from a guild. This action removes the member from the guild but does not ban them, allowing them to rejoin if they have an invite. This command is restricted to members with the appropriate permissions. First check if the user has the 'Kick Members' permission using the get_member_permissions function or if they have a role named 'Moderator' or 'Admin' using the get_member_roles function.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
            },
            required: ["guildId", "memberId", "reason"]
        }
    },
    send_dm: {
        name: "send_dm",
        description: "Sends a direct message (DM) to a user. This can be used to communicate privately with users outside of guild channels. Use this function responsibly and avoid spamming users. Make sure to respect user privacy and Discord's terms of service. If the bot is asked to send a dm, check if the requesting user is an owner or has the appropriate permissions and asks for a dm to a member in the guild.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING }
            },
            required: ["userId", "content"]
        }
    },
    edit_msg: {
        name: "edit_msg",
        description: "Edit a message sent by the bot. This can be used to update information or correct mistakes in previously sent messages. Requires ManageMessages permission in that guild and admin+ staff or owner.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                messageId: { type: SchemaType.STRING },
                channelId: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING }
            },
            required: ["messageId", "channelId", "content"]
        }
    },
    check_vip_status: {
        name: "check_vip_status",
        description: "Check if a user has VIP status. VIP users may have access to special features or privileges. This function can be used to verify a user's VIP status based on their user ID.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    list_guild_roles: {
        name: "list_guild_roles",
        description: "List all roles in a guild. Requires ManageRoles permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            },
            required: ["requesterId", "guildId"]
        }
    },
    get_role_info: {
        name: "get_role_info",
        description: "Get detailed information about a specific role. Requires ManageRoles permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                roleId: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "roleId"]
        }
    },
    create_role: {
        name: "create_role",
        description: "Create a new role in a guild. Requires ManageRoles permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                name: { type: SchemaType.STRING },
                color: { type: SchemaType.STRING },
                hoist: { type: SchemaType.BOOLEAN },
                mentionable: { type: SchemaType.BOOLEAN },
                permissions: { type: SchemaType.ARRAY },
                reason: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "name"]
        }
    },
    edit_role: {
        name: "edit_role",
        description: "Edit a role's properties (name, color, permissions, etc.). Requires ManageRoles permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                roleId: { type: SchemaType.STRING },
                name: { type: SchemaType.STRING },
                color: { type: SchemaType.STRING },
                hoist: { type: SchemaType.BOOLEAN },
                mentionable: { type: SchemaType.BOOLEAN },
                permissions: { type: SchemaType.ARRAY },
                reason: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "roleId"]
        }
    },
    delete_role: {
        name: "delete_role",
        description: "Delete a role from a guild. Requires ManageRoles permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                roleId: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "roleId"]
        }
    },
    add_role_to_member: {
        name: "add_role_to_member",
        description: "Assign a role to a member. Requires ManageRoles permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING },
                roleId: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "memberId", "roleId"]
        }
    },
    remove_role_from_member: {
        name: "remove_role_from_member",
        description: "Remove a role from a member. Requires ManageRoles permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING },
                roleId: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "memberId", "roleId"]
        }
    },
    get_role_members: {
        name: "get_role_members",
        description: "Get all members who have a specific role. Requires ManageRoles permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                roleId: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            },
            required: ["requesterId", "guildId", "roleId"]
        }
    },
    list_guild_members: {
        name: "list_guild_members",
        description: "List members in a guild. Requires KickMembers or ManageGuild permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            },
            required: ["requesterId", "guildId"]
        }
    },
    search_guild_members: {
        name: "search_guild_members",
        description: "Search for members by username in a guild. Requires KickMembers or ManageGuild permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                query: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            },
            required: ["requesterId", "guildId", "query"]
        }
    },
    get_member_info: {
        name: "get_member_info",
        description: "Get detailed information about a specific member. Requires KickMembers or ManageGuild permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "memberId"]
        }
    },
    ban_member: {
        name: "ban_member",
        description: "Ban a member from the guild. Requires BanMembers permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING },
                deleteMessageSeconds: { type: SchemaType.NUMBER }
            },
            required: ["requesterId", "guildId", "memberId"]
        }
    },
    unban_member: {
        name: "unban_member",
        description: "Unban a member from the guild. Requires BanMembers permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                userId: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "userId"]
        }
    },
    timeout_member: {
        name: "timeout_member",
        description: "Timeout (mute) a member for a specified duration. Requires ModerateMembers permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING },
                durationMs: { type: SchemaType.NUMBER },
                reason: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "memberId", "durationMs"]
        }
    },
    remove_timeout_member: {
        name: "remove_timeout_member",
        description: "Remove timeout from a member. Requires ModerateMembers permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "memberId"]
        }
    },
    set_member_nickname: {
        name: "set_member_nickname",
        description: "Change a member's nickname. Requires ManageNicknames permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING },
                nickname: { type: SchemaType.STRING },
                reason: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "memberId"]
        }
    },
    move_member_voice: {
        name: "move_member_voice",
        description: "Move a member to a different voice channel. Requires MoveMembers permission (or admin+ staff/owner).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                requesterId: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING },
                memberId: { type: SchemaType.STRING },
                channelId: { type: SchemaType.STRING }
            },
            required: ["requesterId", "guildId", "memberId", "channelId"]
        }
    },

} satisfies Record<string, FunctionDeclaration>;

export default membersDeclarations;
