import OpenAi from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";
import { promises as fs } from "fs";
import * as https from "https";
import sharp from "sharp";
import type { NIMChatMessage, NIMChatResult, NIMChatSession, NIMToolDefinition } from "../types/nvidia";
export type { NIMToolCall, NIMChatResponse, NIMChatResult, NIMChatMessage, NIMToolDefinition, NIMChatSession } from "../types/nvidia";

const AI_DEBUG = process.env.AI_DEBUG === "1";

const stripThink = (text: string): string => {
    if (!text) return "";
    return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
};

class NIMChatSessionImpl implements NIMChatSession {
    private messages: NIMChatMessage[] = [];
    private lastToolCalls: Array<{ id: string; name: string }> = [];
    private timeoutMs: number;
    constructor(
        private openai: OpenAi,
        private model: string,
        private tools: NIMToolDefinition[] | undefined,
        private config: { max_tokens?: number; temperature?: number; top_p?: number; chat_template_kwargs?: any },
        systemInstruction?: string,
        timeoutMs: number = 120000
    ) {
        this.timeoutMs = timeoutMs;
        if (systemInstruction) {
            this.messages.push({ role: "system", content: systemInstruction });
        }
    }
    private parseArgs(value: string) {
        try {
            return value ? JSON.parse(value) : {};
        } catch {
            return value;
        }
    }
    private shouldIncludeChatTemplate(model: string): boolean {
        const supported = ["deepseek-ai", "stepfun-ai", "minimaxai", "qwen"];
        return supported.some(p => model.toLowerCase().startsWith(p));
    }
    private createToolMessage(name: string, result: any) {
        const toolCallId = this.lastToolCalls.find(call => call.name === name)?.id;
        return {
            role: "tool",
            tool_call_id: toolCallId ?? `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            content: JSON.stringify(result ?? {})
        } as ChatCompletionMessageParam;
    }
    public primeTools(toolResults: Array<{ name: string; result: any; args?: any }>): void {
        if (!toolResults.length) return;
        const toolCalls = toolResults.map(result => ({
            id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            type: "function",
            function: {
                name: result.name,
                arguments: JSON.stringify(result.args ?? {})
            }
        }));
        this.messages.push({ role: "assistant", tool_calls: toolCalls } as ChatCompletionMessageParam);
        this.lastToolCalls = toolCalls.map(call => ({ id: call.id, name: call.function?.name }));
        for (const toolResult of toolResults) {
            this.messages.push(this.createToolMessage(toolResult.name, toolResult.result));
        }
    }
    public addSystemMessage(content: string): void {
        if (!content || !content.trim()) return;
        let insertAt = 0;
        while (insertAt < this.messages.length && this.messages[insertAt].role === "system") {
            insertAt++;
        }
        this.messages.splice(insertAt, 0, { role: "system", content: content.trim() });
    }
    public async sendMessage(input: string | Array<{ functionResponse: { name: string; response: { result: any } } }>): Promise<NIMChatResult> {
        if (typeof input === "string") {
            this.messages.push({ role: "user", content: input });
        } else if (Array.isArray(input)) {
            for (const item of input) {
                const name = item?.functionResponse?.name;
                if (!name) continue;
                const result = item.functionResponse.response?.result;
                this.messages.push(this.createToolMessage(name, result));
            }
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        let lastError: any;
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            try {
                const response = await this.openai.chat.completions.create({
                    model: this.model,
                    messages: this.messages,
                    tools: this.tools,
                    tool_choice: this.tools && this.tools.length > 0 ? "auto" : undefined,
                    max_tokens: this.config.max_tokens,
                    temperature: this.config.temperature,
                    top_p: this.config.top_p,
                    stream: false,
                    ...(this.shouldIncludeChatTemplate(this.model) && this.config.chat_template_kwargs && { chat_template_kwargs: this.config.chat_template_kwargs })
                }, { signal: controller.signal as any });
                clearTimeout(timer);
                const message = response.choices[0]?.message as any;
                if (message) {
                    this.messages.push(message as ChatCompletionMessageParam);
                }
                const toolCalls = Array.isArray(message?.tool_calls)
                    ? message.tool_calls.map((call: any) => ({
                        name: call.function?.name,
                        args: this.parseArgs(call.function?.arguments ?? "")
                    }))
                    : undefined;
                this.lastToolCalls = Array.isArray(message?.tool_calls)
                    ? message.tool_calls.map((call: any) => ({ id: call.id, name: call.function?.name }))
                    : [];
                const text = stripThink(message?.content ?? "");
                return { response: { text: () => text, functionCalls: () => toolCalls } };
            } catch (err: any) {
                lastError = err;
                const isRetryable = err?.status === 429 || err?.status === 503 || err?.code === "ETIMEDOUT" || err?.code === "ECONNRESET" || err?.message?.includes("ResourceExhausted") || err?.message?.includes("All workers are busy");
                if (!isRetryable) break;
            }
        }
        clearTimeout(timer);
        throw lastError || new Error("Failed to get AI response after retries");
    }
}

export default class NVIDIAModelsManager {
    private clients: Array<{ key: string; openai: OpenAi }>;
    private currentIndex: number = 0;

    constructor(apiKeys: string[]) {
        if (!apiKeys || apiKeys.length === 0) {
            throw new Error("At least one NVIDIA API key is required");
        }
        const agent = new https.Agent({ keepAlive: true, timeout: 120000 });
        this.clients = apiKeys.map(key => ({
            key,
            openai: new OpenAi({
                apiKey: key,
                baseURL: "https://integrate.api.nvidia.com/v1",
                timeout: 120000,
                httpAgent: agent
            })
        }));
    }

    private getNextClient(): { key: string; openai: OpenAi } {
        const client = this.clients[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.clients.length;
        return client;
    };
    public GetConversationSafety = async (messages: ChatCompletionMessageParam[], timeoutMs: number = 2000): Promise<{ safe: boolean, reason?: string }> => {
        try {
            const { openai } = this.getNextClient();
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
            const response = await openai.chat.completions.create({
                model: "nvidia/llama-3.1-nemoguard-8b-content-safety",
                messages,
                stream: false
            }, { signal: controller.signal as any });
            clearTimeout(timer);
            const parsedResponse = JSON.parse(response.choices[0]?.message?.content!) as { "User Safety": string, "Safety Categories": string };

            return { safe: parsedResponse["User Safety"] === "safe", reason: parsedResponse["User Safety"] !== "safe" ? parsedResponse["Safety Categories"] : undefined };
        } catch (error) {
            console.error("Error checking conversation safety:", error);
            return { safe: true };
        }
    };
    public GetModelChatResponse = async (messages: ChatCompletionMessageParam[], timeoutMs: number = 2000, task: string, think: boolean): Promise<{ content: string, reasoning?: string }> => {
        try {
            const { openai } = this.getNextClient();
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
            const selectedTask = this.NormalizeTask(task);
            const modelConfig = this.GetTaskBasedModel(selectedTask);
            if (!modelConfig.name) {
                throw new Error(`No model found for task: ${task}`);
            }
            const response = await openai.chat.completions.create({
                model: modelConfig.name,
                messages: messages,
                stream: false,
                ...(modelConfig.hasThinkMode && { chat_template_kwargs: { thinking: think ?? false } }),
                ...this.GetCustomTaskConfig(selectedTask)
            }, { signal: controller.signal as any });
            clearTimeout(timer);
            const content = stripThink(response.choices[0]?.message?.content || "");
            return { content, reasoning: modelConfig.hasReasoning && think && modelConfig.hasThinkMode ? (response.choices[0]?.message as any).reasoning_content : modelConfig.hasReasoning ? (response.choices[0]?.message as any).reasoning_content : undefined };
        } catch (error) {
            console.error("Error getting reasoning response:", error);
            return { content: "", reasoning: undefined };
        }
    }
    private NormalizeTask = (task: string | null | undefined): string => {
        const normalized = String(task ?? "").trim().toLowerCase();
        if (!normalized) return "chat";

        const aliases: { [key: string]: string } = {
            "general question": "chat",
            "general_question": "chat",
            "general reasoning": "reasoning",
            "general_reasoning": "reasoning",
            "math problem": "math",
            "math_problem": "math",
            "programming help": "programming",
            "programming_help": "programming"
        };

        return aliases[normalized] || normalized;
    }
    public CreateChatSession = (options: { tools?: NIMToolDefinition[]; systemInstruction?: string; maxTokens?: number; temperature?: number; topP?: number; model?: string; timeout?: number } = {}): NIMChatSession => {
        const { openai } = this.getNextClient();
        const model = options.model ?? "stepfun-ai/step-3.7-flash";
        return new NIMChatSessionImpl(
            openai,
            model,
            options.tools,
            {
                max_tokens: options.maxTokens ?? 800,
                temperature: options.temperature ?? 0.7,
                top_p: options.topP ?? 0.8,
                chat_template_kwargs: { thinking: false },
            },
            options.systemInstruction,
            options.timeout
        );
    }
    private GetTaskBasedModel = (task: string): { name: string, hasReasoning: boolean, hasThinkMode: boolean } => {
        const base = { name: "nvidia/llama-3.3-nemotron-super-49b-v1", hasReasoning: false, hasThinkMode: false };
        const monitorSmall = { name: "meta/llama-3.1-8b-instruct", hasReasoning: false, hasThinkMode: false };
        const taskModels: { [key: string]: { name: string, hasReasoning: boolean, hasThinkMode: boolean } } = {
            "chat": { name: "stepfun-ai/step-3.7-flash", hasReasoning: false, hasThinkMode: true },
            "reasoning": {
                name: "deepseek-ai/deepseek-v3.2",
                hasReasoning: true,
                hasThinkMode: false
            },
            "math": {
                name: "qwen/qwq-32b",
                hasReasoning: false,
                hasThinkMode: false
            },
            "programming": {
                name: "nvidia/llama-3.3-nemotron-super-49b-v1",
                hasReasoning: false,
                hasThinkMode: false
            },
            "monitor_small": monitorSmall,
            "monitor_large": base
        };
        return taskModels[task] || base;
    }
    private GetCustomTaskConfig = (task: string): { max_tokens: number, top_p: number, temperature: number } => {
        const taskConfigs: { [key: string]: { max_tokens: number, top_p: number, temperature: number } } = {
            "chat": {
                "max_tokens": 1024,
                "top_p": 0.9,
                "temperature": 0.7
            },
            "reasoning": {
                "max_tokens": 2048,
                "top_p": 0.9,
                "temperature": 0.7
            },
            "math": {
                "max_tokens": 4096,
                "top_p": 0.95,
                "temperature": 0.3
            },
            "programming": {
                "max_tokens": 2048,
                "top_p": 0.9,
                "temperature": 0.35
            },
            "monitor_small": {
                "max_tokens": 256,
                "top_p": 0.8,
                "temperature": 0.2
            },
            "monitor_large": {
                "max_tokens": 1024,
                "top_p": 0.9,
                "temperature": 0.5
            }
        };
        return taskConfigs[task] || { max_tokens: 1024, top_p: 0.9, temperature: 0.7 };
    };
    public GetSpeechToText = async (audioBuffer: Buffer, timeoutMs: number = 15000, functionId?: string): Promise<string> => {
        try {
            const protoPath = path.join(__dirname, "..", "protos", "riva_asr.proto");
            const fs = require("fs");
            const protoDir = path.join(__dirname, "..", "protos");

            if (!fs.existsSync(protoDir)) {
                fs.mkdirSync(protoDir, { recursive: true });
            }

            const protoContent = `
syntax = "proto3";
package nvidia.riva.asr;

service RivaSpeechRecognition {
  rpc Recognize(RecognizeRequest) returns (RecognizeResponse) {}
  rpc StreamingRecognize(stream StreamingRecognizeRequest) returns (stream StreamingRecognizeResponse) {}
}

message RecognizeRequest {
  RecognitionConfig config = 1;
  bytes audio = 2;
}

message RecognizeResponse {
  repeated SpeechRecognitionResult results = 1;
}

message StreamingRecognizeRequest {
  oneof streaming_request {
    StreamingRecognitionConfig streaming_config = 1;
    bytes audio_content = 2;
  }
}

message StreamingRecognizeResponse {
  repeated StreamingRecognitionResult results = 1;
}

message StreamingRecognitionConfig {
  RecognitionConfig config = 1;
  bool interim_results = 2;
}

message RecognitionConfig {
  AudioEncoding encoding = 1;
  int32 sample_rate_hertz = 2;
  string language_code = 3;
  int32 max_alternatives = 4;
  bool enable_automatic_punctuation = 10;
  string model = 13;
}

enum AudioEncoding {
  ENCODING_UNSPECIFIED = 0;
  LINEAR_PCM = 1;
  FLAC = 2;
  MULAW = 3;
  OGGOPUS = 4;
  ALAW = 20;
}

message SpeechRecognitionResult {
  repeated SpeechRecognitionAlternative alternatives = 1;
  int32 channel_tag = 2;
  float audio_processed = 3;
}

message StreamingRecognitionResult {
  repeated SpeechRecognitionAlternative alternatives = 1;
  bool is_final = 2;
  float stability = 3;
  int32 channel_tag = 4;
  float audio_processed = 5;
}

message SpeechRecognitionAlternative {
  string transcript = 1;
  float confidence = 2;
  repeated WordInfo words = 3;
}

message WordInfo {
  int32 start_time = 1;
  int32 end_time = 2;
  string word = 3;
  float confidence = 4;
}
`;

            if (!fs.existsSync(protoPath)) {
                fs.writeFileSync(protoPath, protoContent);
            }

            const packageDefinition = protoLoader.loadSync(protoPath, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            });

            const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
            const rivaPackage = protoDescriptor.nvidia.riva.asr;

            const { key } = this.getNextClient();
            const metadata = new grpc.Metadata();
            metadata.add("authorization", `Bearer ${key}`);
            if (functionId) {
                metadata.add("function-id", functionId);
            }
            const sslCreds = grpc.credentials.createSsl();
            const callCreds = grpc.credentials.createFromMetadataGenerator((params, callback) => {
                callback(null, metadata);
            });
            const credentials = grpc.credentials.combineChannelCredentials(sslCreds, callCreds);
            const client = new rivaPackage.RivaSpeechRecognition(
                "grpc.nvcf.nvidia.com:443",
                credentials
            );
            const request = {
                config: {
                    encoding: "LINEAR_PCM",
                    sample_rate_hertz: 16000,
                    language_code: "en-US",
                    max_alternatives: 1,
                    enable_automatic_punctuation: true,
                    "function-id": process.env.NVIDIA_STT_FUNCTION_ID || ""
                },
                audio: audioBuffer
            };
            return new Promise((resolve, reject) => {
                const deadline = new Date(Date.now() + timeoutMs);

                client.Recognize(request, { deadline }, (error: Error | null, response: any) => {
                    if (error) {
                        console.error("Error during speech recognition:", error);
                        reject(new Error(`Speech recognition failed: ${error.message}`));
                        return;
                    }

                    if (response?.results && response.results.length > 0) {
                        const alternatives = response.results[0].alternatives;
                        if (alternatives && alternatives.length > 0) {
                            resolve(alternatives[0].transcript || "");
                            return;
                        }
                    }

                    resolve("");
                });
            });

        } catch (error) {
            console.error("Error in GetSpeechToText:", error);
            throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public GetTextToSpeech = async (
        text: string,
        voice: string = "Magpie-Multilingual.EN-US.Aria",
        languageCode: string = "en-US",
        timeoutMs: number = 15000,
        functionId?: string
    ): Promise<Buffer> => {
        try {
            const raw = (text || "").toString().trim();
            if (!raw) {
                throw new Error("Empty text provided for TTS");
            }
            const MAX_CHARS = 1800;
            const sentences = raw
                .replace(/\s+/g, " ")
                .split(/(?<=[\.!?])\s+|\n+/g)
                .filter(s => s && s.trim().length > 0);

            const chunks: string[] = [];
            let current = "";
            const pushCurrent = () => {
                const c = current.trim();
                if (c.length) chunks.push(c);
                current = "";
            };
            for (const s of sentences) {
                if ((current + (current ? " " : "") + s).length <= MAX_CHARS) {
                    current += (current ? " " : "") + s;
                } else if (s.length <= MAX_CHARS) {
                    pushCurrent();
                    current = s;
                } else {
                    const words = s.split(/\s+/g);
                    for (const w of words) {
                        if ((current + (current ? " " : "") + w).length <= MAX_CHARS) {
                            current += (current ? " " : "") + w;
                        } else {
                            pushCurrent();
                            current = w;
                        }
                    }
                }
            }
            pushCurrent();

            const protoPath = path.join(__dirname, "..", "protos", "riva_tts.proto");
            const fs = require("fs");
            const protoDir = path.join(__dirname, "..", "protos");

            if (!fs.existsSync(protoDir)) {
                fs.mkdirSync(protoDir, { recursive: true });
            }

            const protoContent = `
syntax = "proto3";
package nvidia.riva.tts;

service RivaSpeechSynthesis {
  rpc Synthesize(SynthesizeSpeechRequest) returns (SynthesizeSpeechResponse) {}
  rpc SynthesizeOnline(SynthesizeSpeechRequest) returns (stream SynthesizeSpeechResponse) {}
  rpc ListVoices(ListVoicesRequest) returns (ListVoicesResponse) {}
}

message SynthesizeSpeechRequest {
  string text = 1;
  string language_code = 2;
  AudioEncoding encoding = 3;
  int32 sample_rate_hertz = 4;
  string voice_name = 5;
}

message SynthesizeSpeechResponse {
  bytes audio = 1;
}

message ListVoicesRequest {
  string language_code = 1;
}

message ListVoicesResponse {
  repeated Voice voices = 1;
}

message Voice {
  string name = 1;
  string language_code = 2;
  int32 sample_rate_hertz = 3;
}

enum AudioEncoding {
  ENCODING_UNSPECIFIED = 0;
  LINEAR_PCM = 1;
  FLAC = 2;
  MULAW = 3;
  OGGOPUS = 4;
  ALAW = 20;
}
`;

            if (!fs.existsSync(protoPath)) {
                fs.writeFileSync(protoPath, protoContent);
            }

            const packageDefinition = protoLoader.loadSync(protoPath, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            });

            const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
            const rivaPackage = protoDescriptor.nvidia.riva.tts;

            const { key } = this.getNextClient();
            const metadata = new grpc.Metadata();
            metadata.add("authorization", `Bearer ${key}`);

            const finalFunctionId = functionId || process.env.NVIDIA_TTS_FUNCTION_ID;
            if (finalFunctionId) {
                metadata.add("function-id", finalFunctionId);
            }

            const sslCreds = grpc.credentials.createSsl();
            const callCreds = grpc.credentials.createFromMetadataGenerator((params, callback) => {
                callback(null, metadata);
            });
            const credentials = grpc.credentials.combineChannelCredentials(sslCreds, callCreds);

            const client = new rivaPackage.RivaSpeechSynthesis(
                "grpc.nvcf.nvidia.com:443",
                credentials
            );

            const synthOne = (part: string) => new Promise<Buffer>((resolve, reject) => {
                const deadline = new Date(Date.now() + timeoutMs);
                const request = {
                    text: part,
                    language_code: languageCode,
                    encoding: "LINEAR_PCM",
                    sample_rate_hertz: 22050,
                    voice_name: voice
                };
                client.Synthesize(request, { deadline }, (error: Error | null, response: any) => {
                    if (error) {
                        console.error("Error during speech synthesis:", error);
                        reject(new Error(`Speech synthesis failed: ${error.message}`));
                        return;
                    }
                    if (response?.audio && response.audio.length) {
                        resolve(Buffer.from(response.audio));
                    } else {
                        reject(new Error("No audio data received"));
                    }
                });
            });

            const audioParts: Buffer[] = [];
            for (const [idx, part] of chunks.entries()) {
                const t = (part || "").trim();
                if (!t) continue;
                const buf = await synthOne(t);
                audioParts.push(buf);
            }

            if (audioParts.length === 0) {
                throw new Error("TTS returned no audio for provided text");
            }
            return Buffer.concat(audioParts as any);

        } catch (error) {
            console.error("Error in GetTextToSpeech:", error);
            throw new Error(`Failed to synthesize speech: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public GetBestMaleVoice = (languageCode: string): string | null => {
        const voices = this.GetAvailableVoices();
        const maleVoices = voices.filter(v =>
            v.languageCode === languageCode &&
            (v.description.includes("Male") || v.name.includes("Jason") || v.name.includes("Leo") || v.name.includes("Diego") || v.name.includes("Pascal"))
        );

        if (maleVoices.length === 0) return null;

        const happyVoice = maleVoices.find(v => v.name.includes(".Happy"));
        if (happyVoice) return happyVoice.name;

        const neutralVoice = maleVoices.find(v => v.name.includes(".Neutral") || !v.name.includes("."));
        if (neutralVoice) return neutralVoice.name;

        return maleVoices[0].name;
    }

    public GetAvailableVoices = (): Array<{ name: string; languageCode: string; description: string }> => {
        return [
            { name: "Magpie-Multilingual.EN-US.Mia", languageCode: "en-US", description: "English (US) - Female - Neutral" },
            { name: "Magpie-Multilingual.EN-US.Mia.Angry", languageCode: "en-US", description: "English (US) - Female - Angry" },
            { name: "Magpie-Multilingual.EN-US.Mia.Calm", languageCode: "en-US", description: "English (US) - Female - Calm" },
            { name: "Magpie-Multilingual.EN-US.Mia.Happy", languageCode: "en-US", description: "English (US) - Female - Happy" },
            { name: "Magpie-Multilingual.EN-US.Mia.Neutral", languageCode: "en-US", description: "English (US) - Female - Neutral" },
            { name: "Magpie-Multilingual.EN-US.Mia.Sad", languageCode: "en-US", description: "English (US) - Female - Sad" },
            { name: "Magpie-Multilingual.EN-US.Jason", languageCode: "en-US", description: "English (US) - Male - Neutral" },
            { name: "Magpie-Multilingual.EN-US.Jason.Angry", languageCode: "en-US", description: "English (US) - Male - Angry" },
            { name: "Magpie-Multilingual.EN-US.Jason.Calm", languageCode: "en-US", description: "English (US) - Male - Calm" },
            { name: "Magpie-Multilingual.EN-US.Jason.Happy", languageCode: "en-US", description: "English (US) - Male - Happy" },
            { name: "Magpie-Multilingual.EN-US.Jason.Neutral", languageCode: "en-US", description: "English (US) - Male - Neutral" },
            { name: "Magpie-Multilingual.EN-US.Aria", languageCode: "en-US", description: "English (US) - Female - Neutral (Default)" },
            { name: "Magpie-Multilingual.EN-US.Aria.Angry", languageCode: "en-US", description: "English (US) - Female - Angry" },
            { name: "Magpie-Multilingual.EN-US.Aria.Calm", languageCode: "en-US", description: "English (US) - Female - Calm" },
            { name: "Magpie-Multilingual.EN-US.Aria.Fearful", languageCode: "en-US", description: "English (US) - Female - Fearful" },
            { name: "Magpie-Multilingual.EN-US.Aria.Happy", languageCode: "en-US", description: "English (US) - Female - Happy" },
            { name: "Magpie-Multilingual.EN-US.Aria.Neutral", languageCode: "en-US", description: "English (US) - Female - Neutral" },
            { name: "Magpie-Multilingual.EN-US.Aria.Sad", languageCode: "en-US", description: "English (US) - Female - Sad" },
            { name: "Magpie-Multilingual.EN-US.Leo", languageCode: "en-US", description: "English (US) - Male - Neutral" },
            { name: "Magpie-Multilingual.EN-US.Leo.Angry", languageCode: "en-US", description: "English (US) - Male - Angry" },
            { name: "Magpie-Multilingual.EN-US.Leo.Calm", languageCode: "en-US", description: "English (US) - Male - Calm" },
            { name: "Magpie-Multilingual.EN-US.Leo.Fearful", languageCode: "en-US", description: "English (US) - Male - Fearful" },
            { name: "Magpie-Multilingual.EN-US.Leo.Neutral", languageCode: "en-US", description: "English (US) - Male - Neutral" },
            { name: "Magpie-Multilingual.EN-US.Leo.Sad", languageCode: "en-US", description: "English (US) - Male - Sad" },
            { name: "Magpie-Multilingual.ES-US.Diego", languageCode: "es-US", description: "Spanish (US) - Male" },
            { name: "Magpie-Multilingual.ES-US.Isabela", languageCode: "es-US", description: "Spanish (US) - Female" },
            { name: "Magpie-Multilingual.FR-FR.Pascal", languageCode: "fr-FR", description: "French - Male - Neutral" },
            { name: "Magpie-Multilingual.FR-FR.Pascal.Angry", languageCode: "fr-FR", description: "French - Male - Angry" },
            { name: "Magpie-Multilingual.FR-FR.Pascal.Calm", languageCode: "fr-FR", description: "French - Male - Calm" },
            { name: "Magpie-Multilingual.FR-FR.Pascal.Disgusted", languageCode: "fr-FR", description: "French - Male - Disgusted" },
            { name: "Magpie-Multilingual.FR-FR.Pascal.Happy", languageCode: "fr-FR", description: "French - Male - Happy" },
            { name: "Magpie-Multilingual.FR-FR.Pascal.Neutral", languageCode: "fr-FR", description: "French - Male - Neutral" },
            { name: "Magpie-Multilingual.FR-FR.Pascal.Sad", languageCode: "fr-FR", description: "French - Male - Sad" },
            { name: "Magpie-Multilingual.FR-FR.Louise", languageCode: "fr-FR", description: "French - Female - Neutral" },
            { name: "Magpie-Multilingual.FR-FR.Louise.Calm", languageCode: "fr-FR", description: "French - Female - Calm" },
            { name: "Magpie-Multilingual.FR-FR.Louise.Disgusted", languageCode: "fr-FR", description: "French - Female - Disgusted" },
            { name: "Magpie-Multilingual.FR-FR.Louise.Fearful", languageCode: "fr-FR", description: "French - Female - Fearful" },
            { name: "Magpie-Multilingual.FR-FR.Louise.Happy", languageCode: "fr-FR", description: "French - Female - Happy" },
            { name: "Magpie-Multilingual.FR-FR.Louise.Neutral", languageCode: "fr-FR", description: "French - Female - Neutral" },
            { name: "Magpie-Multilingual.FR-FR.Louise.Sad", languageCode: "fr-FR", description: "French - Female - Sad" },
            { name: "Magpie-Multilingual.DE-DE.Aria", languageCode: "de-DE", description: "German - Female - Neutral" },
            { name: "Magpie-Multilingual.DE-DE.Aria.Angry", languageCode: "de-DE", description: "German - Female - Angry" },
            { name: "Magpie-Multilingual.DE-DE.Aria.Calm", languageCode: "de-DE", description: "German - Female - Calm" },
            { name: "Magpie-Multilingual.DE-DE.Aria.Fearful", languageCode: "de-DE", description: "German - Female - Fearful" },
            { name: "Magpie-Multilingual.DE-DE.Aria.Happy", languageCode: "de-DE", description: "German - Female - Happy" },
            { name: "Magpie-Multilingual.DE-DE.Aria.Neutral", languageCode: "de-DE", description: "German - Female - Neutral" },
            { name: "Magpie-Multilingual.DE-DE.Aria.Sad", languageCode: "de-DE", description: "German - Female - Sad" },
            { name: "Magpie-Multilingual.DE-DE.Jason", languageCode: "de-DE", description: "German - Male - Neutral" },
            { name: "Magpie-Multilingual.DE-DE.Jason.Angry", languageCode: "de-DE", description: "German - Male - Angry" },
            { name: "Magpie-Multilingual.DE-DE.Jason.Calm", languageCode: "de-DE", description: "German - Male - Calm" },
            { name: "Magpie-Multilingual.DE-DE.Jason.Happy", languageCode: "de-DE", description: "German - Male - Happy" },
            { name: "Magpie-Multilingual.DE-DE.Jason.Neutral", languageCode: "de-DE", description: "German - Male - Neutral" },
            { name: "Magpie-Multilingual.DE-DE.Leo", languageCode: "de-DE", description: "German - Male - Neutral" },
            { name: "Magpie-Multilingual.DE-DE.Leo.Angry", languageCode: "de-DE", description: "German - Male - Angry" },
            { name: "Magpie-Multilingual.DE-DE.Leo.Calm", languageCode: "de-DE", description: "German - Male - Calm" },
            { name: "Magpie-Multilingual.DE-DE.Leo.Fearful", languageCode: "de-DE", description: "German - Male - Fearful" },
            { name: "Magpie-Multilingual.DE-DE.Leo.Neutral", languageCode: "de-DE", description: "German - Male - Neutral" },
            { name: "Magpie-Multilingual.DE-DE.Leo.Sad", languageCode: "de-DE", description: "German - Male - Sad" },
            { name: "Magpie-Multilingual.DE-DE.Diego", languageCode: "de-DE", description: "German - Male" },
            { name: "Magpie-Multilingual.ZH-CN.Mia", languageCode: "zh-CN", description: "Chinese - Female" },
            { name: "Magpie-Multilingual.ZH-CN.Aria", languageCode: "zh-CN", description: "Chinese - Female" },
            { name: "Magpie-Multilingual.ZH-CN.Diego", languageCode: "zh-CN", description: "Chinese - Male" },
            { name: "Magpie-Multilingual.ZH-CN.Isabela", languageCode: "zh-CN", description: "Chinese - Female" },
            { name: "Magpie-Multilingual.ZH-CN.Pascal", languageCode: "zh-CN", description: "Chinese - Male" },
            { name: "Magpie-Multilingual.ZH-CN.Louise", languageCode: "zh-CN", description: "Chinese - Female" }
        ];
    }
    public GetVisualDescription = async (imageUrl: string, messageId: string, language: string, timeoutMs: number = 30000): Promise<string> => {
        const workspaceDir = path.join(__dirname, "..", "ai_workspace");
        await fs.mkdir(workspaceDir, { recursive: true });

        const imgResp = await fetch(imageUrl);
        if (!imgResp.ok) return "";
        const arrayBuffer = await imgResp.arrayBuffer();
        const originalBuffer = Buffer.from(arrayBuffer);

        const resizedBuffer = await sharp(originalBuffer)
            .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
            .png({ quality: 100, compressionLevel: 4 })
            .toBuffer();

        const b64 = resizedBuffer.toString("base64");
        const mime = "image/png";
        if (AI_DEBUG) console.log("[Vision] Resized image base64 length:", b64.length, "chars (~", Math.round(b64.length / 4), "tokens)");
        const payload = {
            model: "nvidia/nemotron-nano-12b-v2-vl",
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: `Describe this image in detail, including any text, UI elements, games, apps, or websites shown (use this language: ${language}).` },
                    { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } }
                ]
            }],
            max_tokens: 1024,
            temperature: 0.7,
            top_p: 0.9,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            stream: false
        };
        const body = JSON.stringify(payload);
        const triedKeys = new Set<string>();
        for (let attempt = 0; attempt < this.clients.length; attempt++) {
            const { key } = this.getNextClient();
            if (triedKeys.has(key)) continue;
            triedKeys.add(key);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
            try {
                const visionResp = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "Content-Type": "application/json" },
                    body,
                    signal: controller.signal as any
                });
                clearTimeout(timer);
                if (AI_DEBUG) console.log("[Vision] Response status:", visionResp.status, "key:", key.slice(0, 10) + "...");
                if (!visionResp.ok) {
                    const errorText = await visionResp.text().catch(() => "");
                    console.error("[Vision] API error:", visionResp.status, errorText);
                    continue;
                }
                const json: any = await visionResp.json();
                const result = String(json?.choices?.[0]?.message?.content || "").trim();
                if (AI_DEBUG) console.log("[Vision] Result:", result.length, "chars -", result.substring(0, 100));
                return result || "No visual details detected.";
            } catch (err) {
                clearTimeout(timer);
                console.error("[Vision] Exception:", err);
            }
        }
        return "";
    };
};
