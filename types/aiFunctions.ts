import type { SchemaType } from "../AIFunctions";

export type FunctionDeclaration = {
    name: string;
    description: string;
    parameters: {
        type: SchemaType;
        properties: Record<string, any>;
        required?: string[];
    };
};

export type OpenAIToolDefinition = {
    type: "function";
    function: FunctionDeclaration;
};
