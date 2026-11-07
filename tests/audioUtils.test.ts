declare var describe: any;
declare var test: any;
declare var expect: any;

import { resampleAudio, stereoToMono, wavToRawPCM } from "../utils/audioUtils";

describe("audioUtils", () => {
  test("stereoToMono ignores a trailing partial frame", () => {
    const input = Buffer.alloc(10);
    input.writeInt16LE(100, 0);
    input.writeInt16LE(300, 2);
    input.writeInt16LE(-100, 4);
    input.writeInt16LE(-300, 6);
    const mono = stereoToMono(input);
    expect(mono.length).toBe(4);
    expect(mono.readInt16LE(0)).toBe(200);
    expect(mono.readInt16LE(2)).toBe(-200);
  });

  test("resampleAudio handles buffers with a partial trailing sample", () => {
    const input = Buffer.alloc(201);
    expect(() => resampleAudio(input, 48000, 16000, 1)).not.toThrow();
    expect(resampleAudio(Buffer.alloc(1), 48000, 16000, 1).length).toBe(0);
  });

  test("wavToRawPCM skips the pad byte after odd-sized chunks", () => {
    const list = Buffer.concat([Buffer.from("LIST"), Buffer.from([3, 0, 0, 0]), Buffer.from("abc"), Buffer.from([0])]);
    const pcm = Buffer.from([1, 2, 3, 4]);
    const data = Buffer.concat([Buffer.from("data"), Buffer.from([4, 0, 0, 0]), pcm]);
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), list, data]);
    expect(wavToRawPCM(wav)).toEqual(pcm);
  });
});
