import LogManager from "./managers/LogManager";
const Log = new LogManager(["bot", "commands", "system", "database", "chat-manager", "workers"]);
export default Log;