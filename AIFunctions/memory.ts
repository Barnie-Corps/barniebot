// AI tool declarations: AI chat sessions and the long-term memory graph.
import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const memoryDeclarations = {
    create_chat_session: {
        name: "create_chat_session",
        description: "Create a new persistent chat session that can be resumed later. Each session has a unique ID and stores conversation history.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                title: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    list_chat_sessions: {
        name: "list_chat_sessions",
        description: "List all active chat sessions for a user. Shows session IDs, titles, and metadata.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    load_chat_session: {
        name: "load_chat_session",
        description: "Load a previous chat session with its full conversation history to resume the conversation.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                sessionId: { type: SchemaType.STRING }
            },
            required: ["userId", "sessionId"]
        }
    },
    delete_chat_session: {
        name: "delete_chat_session",
        description: "Delete a chat session permanently. The session will be marked as inactive and cannot be resumed.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                sessionId: { type: SchemaType.STRING }
            },
            required: ["userId", "sessionId"]
        }
    },
    save_chat_message: {
        name: "save_chat_message",
        description: "Save a message to a chat session for persistence. Internal function for maintaining chat history.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                sessionId: { type: SchemaType.STRING },
                role: { type: SchemaType.STRING },
                content: { type: SchemaType.STRING },
                toolCalls: { type: SchemaType.STRING },
                toolResults: { type: SchemaType.STRING }
            },
            required: ["sessionId", "role", "content"]
        }
    },
    compress_chat_context: {
        name: "compress_chat_context",
        description: "Compress older messages in a chat session by summarizing them to save tokens while preserving context. Automatically called when sessions get long.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                sessionId: { type: SchemaType.STRING }
            },
            required: ["sessionId"]
        }
    },
    add_memory_to_graph: {
        name: "add_memory_to_graph",
        description: "Add or update a structured memory in the user's memory graph. Supports categorization (personal, preferences, relationships, facts), related entities, and confidence scores for better learning and context.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                memoryType: { type: SchemaType.STRING, description: "Type of memory: personal, preferences, relationships, facts, skills, or other" },
                subject: { type: SchemaType.STRING, description: "The subject or key topic of this memory" },
                content: { type: SchemaType.STRING, description: "The actual memory content or value" },
                relatedEntities: { type: SchemaType.ARRAY, description: "Array of related entities, people, or topics" },
                confidence: { type: SchemaType.NUMBER, description: "Confidence score 0.0 to 1.0, defaults to 1.0" }
            },
            required: ["userId", "memoryType", "subject", "content"]
        }
    },
    get_memory_graph: {
        name: "get_memory_graph",
        description: "Retrieve memories from the user's memory graph. Can filter by type and subject. Returns structured memories with relationships, confidence scores, and access patterns for better context understanding.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                memoryType: { type: SchemaType.STRING },
                subject: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            },
            required: ["userId"]
        }
    },
    search_memory_graph: {
        name: "search_memory_graph",
        description: "Search the user's memory graph for relevant memories matching a query. Useful for finding specific information learned about the user.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING },
                query: { type: SchemaType.STRING },
                limit: { type: SchemaType.NUMBER }
            },
            required: ["userId", "query"]
        }
    },

} satisfies Record<string, FunctionDeclaration>;

export default memoryDeclarations;
