import AiManager from "./managers/AiManager";
const ai = new AiManager(
    10, 10, 120000,
    process.env.OLLAMA_ENABLED === "true",
    {
        host: process.env.OLLAMA_HOST || "localhost",
        port: Number(process.env.OLLAMA_PORT) || 11434,
        baseUrl: `http://${process.env.OLLAMA_HOST || "localhost"}:${process.env.OLLAMA_PORT || 11434}/api`
    }
);
export default ai;
