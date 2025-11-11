import NVIDIAModelsManager from "./managers/NVIDIAModelsManager"

const NVIDIAModels = new NVIDIAModelsManager(process.env.NVIDIA_API_KEY!);

export default NVIDIAModels;