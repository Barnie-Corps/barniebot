export function stereoToMono(buffer: Buffer): Buffer {
    const samples = buffer.length / 4;
    const monoBuffer = Buffer.alloc(samples * 2);

    for (let i = 0; i < samples; i++) {
        const left = buffer.readInt16LE(i * 4);
        const right = buffer.readInt16LE(i * 4 + 2);
        const mono = Math.round((left + right) / 2);
        monoBuffer.writeInt16LE(mono, i * 2);
    }

    return monoBuffer;
}

export function resampleAudio(buffer: Buffer, fromRate: number, toRate: number, channels: number): Buffer {
    if (fromRate === toRate) {
        return buffer;
    }

    const bytesPerSample = 2;
    const inputSamples = buffer.length / (bytesPerSample * channels);
    const outputSamples = Math.floor(inputSamples * toRate / fromRate);
    const outputBuffer = Buffer.alloc(outputSamples * bytesPerSample * channels);

    const ratio = inputSamples / outputSamples;

    for (let i = 0; i < outputSamples; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples - 1);
        const fraction = srcIndex - srcIndexFloor;

        for (let ch = 0; ch < channels; ch++) {
            const sample1 = buffer.readInt16LE((srcIndexFloor * channels + ch) * bytesPerSample);
            const sample2 = buffer.readInt16LE((srcIndexCeil * channels + ch) * bytesPerSample);
            const interpolated = Math.round(sample1 + (sample2 - sample1) * fraction);
            outputBuffer.writeInt16LE(interpolated, (i * channels + ch) * bytesPerSample);
        }
    }

    return outputBuffer;
}

export function wavToRawPCM(wavBuffer: Buffer): Buffer {
    let offset = 12;
    let dataOffset = 0;
    let dataSize = 0;

    while (offset < wavBuffer.length - 8) {
        const chunkId = wavBuffer.toString("ascii", offset, offset + 4);
        const chunkSize = wavBuffer.readUInt32LE(offset + 4);

        if (chunkId === "data") {
            dataOffset = offset + 8;
            dataSize = chunkSize;
            break;
        }

        offset += 8 + chunkSize;
    }

    if (dataOffset === 0) {
        throw new Error("No 'data' chunk found in WAV file");
    }

    // Extract raw PCM data
    return wavBuffer.slice(dataOffset, dataOffset + dataSize);
}

export function validateAudioBuffer(buffer: Buffer): {
    valid: boolean;
    warnings: string[];
    info: {
        size: number;
        estimatedDurationSeconds: number;
    };
} {
    const warnings: string[] = [];
    let valid = true;

    if (buffer.length < 32000) {
        warnings.push("Audio buffer is very small, might be too short");
    }

    const maxSize = 60 * 16000 * 2;
    if (buffer.length > maxSize) {
        warnings.push("Audio buffer is large, might exceed recommended duration");
        warnings.push("Consider splitting into smaller chunks");
    }

    const estimatedDurationSeconds = buffer.length / (16000 * 2);

    if (buffer.length % 2 !== 0) {
        warnings.push("Buffer size is odd, expected even number for 16-bit audio");
        valid = false;
    }

    return {
        valid,
        warnings,
        info: {
            size: buffer.length,
            estimatedDurationSeconds: Math.round(estimatedDurationSeconds * 10) / 10
        }
    };
}

export function isWavFile(buffer: Buffer): boolean {
    if (buffer.length < 12) return false;
    
    const riff = buffer.toString("ascii", 0, 4);
    const wave = buffer.toString("ascii", 8, 12);
    
    return riff === "RIFF" && wave === "WAVE";
}

export function getWavInfo(wavBuffer: Buffer): {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    duration: number;
    compatible: boolean;
    issues: string[];
} {
    const issues: string[] = [];
    let offset = 12;
    let fmtOffset = 0;

    while (offset < wavBuffer.length - 8) {
        const chunkId = wavBuffer.toString("ascii", offset, offset + 4);
        const chunkSize = wavBuffer.readUInt32LE(offset + 4);

        if (chunkId === "fmt ") {
            fmtOffset = offset + 8;
            break;
        }

        offset += 8 + chunkSize;
    }

    if (fmtOffset === 0) {
        throw new Error("No 'fmt ' chunk found in WAV file");
    }

    const channels = wavBuffer.readUInt16LE(fmtOffset + 2);
    const sampleRate = wavBuffer.readUInt32LE(fmtOffset + 4);
    const bitsPerSample = wavBuffer.readUInt16LE(fmtOffset + 14);

    // Find data chunk for duration calculation
    offset = 12;
    let dataSize = 0;

    while (offset < wavBuffer.length - 8) {
        const chunkId = wavBuffer.toString("ascii", offset, offset + 4);
        const chunkSize = wavBuffer.readUInt32LE(offset + 4);

        if (chunkId === "data") {
            dataSize = chunkSize;
            break;
        }

        offset += 8 + chunkSize;
    }

    const duration = dataSize / (sampleRate * channels * (bitsPerSample / 8));
    let compatible = true;

    if (sampleRate !== 16000) {
        issues.push(`Sample rate is ${sampleRate}Hz, expected 16000Hz`);
        compatible = false;
    }

    if (channels !== 1) {
        issues.push(`Audio has ${channels} channel(s), expected 1 (mono)`);
        compatible = false;
    }

    if (bitsPerSample !== 16) {
        issues.push(`Bit depth is ${bitsPerSample}-bit, expected 16-bit`);
        compatible = false;
    }

    return {
        sampleRate,
        channels,
        bitsPerSample,
        duration,
        compatible,
        issues
    };
}

export function prepareAudioForASR(audioBuffer: Buffer, autoConvert: boolean = true): {
    buffer: Buffer;
    metadata: {
        originalSize: number;
        processedSize: number;
        isWav: boolean;
        estimatedDuration: number;
        conversionsApplied: string[];
    };
    warnings: string[];
} {
    const warnings: string[] = [];
    const conversionsApplied: string[] = [];
    let processedBuffer = audioBuffer;
    const isWav = isWavFile(audioBuffer);

    let channels = 1;
    let sampleRate = 16000;

    if (isWav) {
        const wavInfo = getWavInfo(audioBuffer);
        channels = wavInfo.channels;
        sampleRate = wavInfo.sampleRate;
        
        if (!wavInfo.compatible) {
            if (autoConvert) {
                warnings.push("WAV file is not in optimal format - applying automatic conversion:");
                warnings.push(...wavInfo.issues);
            } else {
                warnings.push("WAV file is not in optimal format:");
                warnings.push(...wavInfo.issues);
                warnings.push("Results may be degraded or fail");
            }
        }

        processedBuffer = wavToRawPCM(audioBuffer);

        if (autoConvert) {
            if (sampleRate !== 16000) {
                conversionsApplied.push(`Resampled from ${sampleRate}Hz to 16000Hz`);
                processedBuffer = resampleAudio(processedBuffer, sampleRate, 16000, channels);
                sampleRate = 16000;
            }

            if (channels === 2) {
                conversionsApplied.push("Converted stereo to mono");
                processedBuffer = stereoToMono(processedBuffer);
                channels = 1;
            } else if (channels > 2) {
                warnings.push(`Audio has ${channels} channels - only stereo to mono conversion is supported`);
                warnings.push("Multichannel audio may not work correctly");
            }
        }
    }

    const validation = validateAudioBuffer(processedBuffer);
    if (validation.warnings.length > 0 && conversionsApplied.length === 0) {
        warnings.push(...validation.warnings);
    }

    if (conversionsApplied.length > 0) {
        warnings.push(`✅ Successfully converted: ${conversionsApplied.join(", ")}`);
    }

    return {
        buffer: processedBuffer,
        metadata: {
            originalSize: audioBuffer.length,
            processedSize: processedBuffer.length,
            isWav,
            estimatedDuration: validation.info.estimatedDurationSeconds,
            conversionsApplied
        },
        warnings
    };
}
