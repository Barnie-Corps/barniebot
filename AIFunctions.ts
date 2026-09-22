import functionDeclarations from "./AIFunctions/index";
import type { OpenAIToolDefinition } from "./types/aiFunctions";

export { SchemaType } from "./types/aiFunctions";
export type { FunctionDeclaration, OpenAIToolDefinition } from "./types/aiFunctions";

export const AIFunctionDeclarations = Object.values(functionDeclarations);

const AIFunctions: OpenAIToolDefinition[] = AIFunctionDeclarations.map(fn => ({
    type: "function",
    function: fn
}));

export default AIFunctions;
