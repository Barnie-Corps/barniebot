export enum SchemaType {
    OBJECT = "object",
    STRING = "string",
    NUMBER = "number",
    INTEGER = "integer",
    BOOLEAN = "boolean",
    ARRAY = "array"
}

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
