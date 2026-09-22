import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const ticketsDeclarations = {
    create_support_ticket: {
        name: "create_support_ticket",
        description: "Create a new support ticket for a user. Can be used to help users submit bug reports, feature requests, or get help.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                initialMessage: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING }
            },
            required: ["userId", "initialMessage"]
        }
    },
    create_bug_report: {
        name: "create_bug_report",
        description: "Submit a bug report to the configured bug reports channel. Use this to file issues discovered by the user.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                title: { type: SchemaType.STRING },
                description: { type: SchemaType.STRING },
                steps: { type: SchemaType.STRING },
                expected: { type: SchemaType.STRING },
                actual: { type: SchemaType.STRING },
                severity: { type: SchemaType.STRING },
                guildId: { type: SchemaType.STRING }
            },
            required: ["userId", "title", "description"]
        }
    },
    get_ticket_details: {
        name: "get_ticket_details",
        description: "Get detailed information about a specific support ticket by its ID.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                ticketId: { type: SchemaType.NUMBER }
            },
            required: ["ticketId"]
        }
    },
    get_user_tickets: {
        name: "get_user_tickets",
        description: "Get all support tickets for a specific user. Optionally filter by status (open, closed, etc).",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                status: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    assign_ticket: {
        name: "assign_ticket",
        description: "Assign a support ticket to a staff member. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                ticketId: { type: SchemaType.NUMBER },
                staffId: { type: SchemaType.STRING }
            },
            required: ["ticketId", "staffId"]
        }
    },
    close_ticket: {
        name: "close_ticket",
        description: "Close a support ticket. Users can close their own tickets, staff can close any ticket.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                ticketId: { type: SchemaType.NUMBER }
            },
            required: ["ticketId"]
        }
    },
    add_ticket_message: {
        name: "add_ticket_message",
        description: "Add a message to an existing support ticket. Used for ticket conversation history.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                ticketId: { type: SchemaType.NUMBER },
                userId: { type: SchemaType.STRING },
                username: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING },
                isStaff: { type: SchemaType.BOOLEAN }
            },
            required: ["ticketId", "userId", "username", "content"]
        }
    },
    get_ticket_messages: {
        name: "get_ticket_messages",
        description: "Get all messages in a support ticket conversation.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                ticketId: { type: SchemaType.NUMBER }
            },
            required: ["ticketId"]
        }
    },
    add_staff_note: {
        name: "add_staff_note",
        description: "Add an internal staff note about a user. Staff-only command. These notes are not visible to users.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                note: { type: SchemaType.STRING }
            },
            required: ["userId", "note"]
        }
    },
    get_staff_notes: {
        name: "get_staff_notes",
        description: "Get all staff notes for a specific user. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    update_staff_status: {
        name: "update_staff_status",
        description: "Update staff member's status (online, busy, away, offline) and optional status message. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                status: { type: SchemaType.STRING },
                statusMessage: { type: SchemaType.STRING }
            },
            required: ["status"]
        }
    },
    get_staff_audit_log: {
        name: "get_staff_audit_log",
        description: "Get staff audit log entries. Can filter by staff member, action type, and limit results. Staff-only command.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                staffId: { type: SchemaType.STRING },
                actionType: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            }
        }
    },

} satisfies Record<string, FunctionDeclaration>;

export default ticketsDeclarations;
