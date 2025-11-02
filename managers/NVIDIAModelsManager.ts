import OpenAi from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import * as path from "path";

export default class NVIDIAModelsManager {
    private openai: OpenAi;
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
        this.openai = new OpenAi({
            apiKey,
            baseURL: "https://integrate.api.nvidia.com/v1"
        });
    };
    public GetConversationSafety = async (messages: ChatCompletionMessageParam[], timeoutMs: number = 2000): Promise<{ safe: boolean, reason?: string }> => {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), Math.max(500, timeoutMs));
            const response = await this.openai.chat.completions.create({
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
    /**
     * Transcribes audio to text using NVIDIA Parakeet ASR model
     * 
     * @param audioBuffer - Audio data in WAV format (16-bit PCM, 16kHz, mono)
     * @param timeoutMs - Request timeout in milliseconds (default: 15000)
     * @param functionId - Your NVIDIA function ID from build.nvidia.com (optional but recommended)
     * @returns Transcribed text
     * 
     * Note: If you don't provide a functionId, the model name will be used but this may not work
     * for all accounts. Get your function ID from https://build.nvidia.com/nvidia/parakeet-1_1b-rnnt-multilingual-asr
     */
    public GetSpeechToText = async (audioBuffer: Buffer, timeoutMs: number = 15000, functionId?: string): Promise<string> => {
        try {
            // Load proto definition
            const protoPath = path.join(__dirname, "..", "protos", "riva_asr.proto");
            
            // For now, we'll create a minimal inline proto since we don't have the full proto files
            // This matches NVIDIA's Riva ASR API structure
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

            // Load the proto file
            const packageDefinition = protoLoader.loadSync(protoPath, {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            });

            const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
            const rivaPackage = protoDescriptor.nvidia.riva.asr;

            // Create metadata with API key and optional function ID
            const metadata = new grpc.Metadata();
            metadata.add("authorization", `Bearer ${this.apiKey}`);
            
            // Add function ID if provided (get this from build.nvidia.com)
            if (functionId) {
                metadata.add("function-id", functionId);
            }

            // Create SSL credentials
            const sslCreds = grpc.credentials.createSsl();
            const callCreds = grpc.credentials.createFromMetadataGenerator((params, callback) => {
                callback(null, metadata);
            });
            const credentials = grpc.credentials.combineChannelCredentials(sslCreds, callCreds);

            // Create gRPC client
            const client = new rivaPackage.RivaSpeechRecognition(
                "grpc.nvcf.nvidia.com:443",
                credentials
            );

            // Prepare recognition config
            const request = {
                config: {
                    encoding: "LINEAR_PCM",
                    sample_rate_hertz: 16000,
                    language_code: "en-US",
                    max_alternatives: 1,
                    enable_automatic_punctuation: true,
                    //model: "nvidia/parakeet-1_1b-rnnt-multilingual-asr",
                    "function-id": process.env.NVIDIA_STT_FUNCTION_ID || ""
                },
                audio: audioBuffer
            };

            // Make the gRPC call with timeout
            return new Promise((resolve, reject) => {
                const deadline = new Date(Date.now() + timeoutMs);
                
                client.Recognize(request, { deadline }, (error: Error | null, response: any) => {
                    if (error) {
                        console.error("Error during speech recognition:", error);
                        reject(new Error(`Speech recognition failed: ${error.message}`));
                        return;
                    }

                    // Extract transcript
                    if (response?.results && response.results.length > 0) {
                        const alternatives = response.results[0].alternatives;
                        if (alternatives && alternatives.length > 0) {
                            resolve(alternatives[0].transcript || "");
                            return;
                        }
                    }
                    
                    resolve(""); // No speech detected
                });
            });

        } catch (error) {
            console.error("Error in GetSpeechToText:", error);
            throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};