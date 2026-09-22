import { SchemaType, type FunctionDeclaration } from "../types/aiFunctions";

const conversationDeclarations = {
    end_conversation: {
        name: "end_conversation",
        description: "Ends the current conversation and clears the user's history. This can be used when the user wants to start a new topic or reset the context. Also to follow the AI RULES.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                reason: { type: SchemaType.STRING, description: "The reason for ending the conversation. It must be provided in the user's language." }
            },
            required: ["reason"]
        }
    },
    add_user_to_convo: {
        name: "add_user_to_convo",
        description: "Add a single additional user to the current AI chat so their messages are accepted.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            },
            required: ["userId"]
        }
    },
    remove_user_from_convo: {
        name: "remove_user_from_convo",
        description: "Remove the additional user previously added to the current AI chat.",
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                userId: { type: SchemaType.STRING }
            }
        }
    },

} satisfies Record<string, FunctionDeclaration>;

export default conversationDeclarations;
