import AiManager from "./managers/AiManager";
const ai = new AiManager(10, 10, 120000, true, { host: "localhost", port: 11434, baseUrl: "http://localhost:11434/api" });
export default ai;