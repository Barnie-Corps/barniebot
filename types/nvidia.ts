import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export type NIMToolCall = { name: string; args: any };
export type NIMChatResponse = { text: () => string; functionCalls: () => NIMToolCall[] | undefined };
export type NIMChatResult = { response: NIMChatResponse };
export type NIMChatMessage = ChatCompletionMessageParam;
export type NIMToolDefinition = {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters?: any;
    };
};
export type NIMChatSession = {
    sendMessage: (input: string | Array<{ functionResponse: { name: string; response: { result: any } } }>) => Promise<NIMChatResult>;
    primeTools?: (toolResults: Array<{ name: string; result: any; args?: any }>) => void;
    addSystemMessage?: (content: string) => void;
};
