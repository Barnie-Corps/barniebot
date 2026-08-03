import NVIDIAModelsManager from "./managers/NVIDIAModelsManager"

const apiKeys = (process.env.NVIDIA_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean);
const NVIDIAModels = new NVIDIAModelsManager(apiKeys);

export default NVIDIAModels;
