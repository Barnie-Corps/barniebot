declare var jest: any;
declare var describe: any;
declare var test: any;
declare var it: any;
declare var expect: any;

jest.mock("../Workers", () => ({
  __esModule: true,
  default: {
    bulkCreateWorkers: jest.fn(),
    prewarmType: jest.fn().mockResolvedValue(undefined),
    getAvailableWorker: jest.fn(),
    createWorker: jest.fn(),
    AwaitAvailableWorker: jest.fn(),
    sendMessage: jest.fn(),
    postMessage: jest.fn(),
    awaitResponse: jest.fn()
  }
}));

jest.mock("../managers/StaffRanksManager", () => ({
  __esModule: true,
  default: {
    hasMinimumRank: jest.fn(),
    getRankHierarchyByName: jest.fn(),
    getRankByHierarchy: jest.fn(),
    getRankByName: jest.fn(),
    hasPermission: jest.fn()
  }
}));

jest.mock("../mysql/database", () => ({
  __esModule: true,
  default: {
    query: jest.fn()
  }
}));

jest.mock("../NVIDIAModels", () => ({
  __esModule: true,
  default: {}
}));

jest.mock("../Log", () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    success: jest.fn()
  }
}));

jest.mock("../data", () => ({
  __esModule: true,
  default: {
    bot: {
      owners: [],
      staff_ranks: []
    }
  }
}));

jest.mock("../index", () => ({
  __esModule: true,
  default: {
    guilds: {
      fetch: jest.fn()
    }
  }
}));

jest.mock("../managers/CacheManager", () => ({
  __esModule: true,
  default: {
    getLocal: jest.fn(),
    setLocal: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    initialize: jest.fn(),
    isRedisAvailable: jest.fn()
  }
}));

import { createCipheriv, randomBytes } from "crypto";
import utils from "../utils";

describe("utils.createCensored", () => {
  test("returns asterisks matching the requested length", () => {
    expect(utils.createCensored(5)).toBe("*****");
  });

  test("returns an empty string for zero length", () => {
    expect(utils.createCensored(0)).toBe("");
  });
});

describe("utils.encryptWithAES and utils.decryptWithAES", () => {
  const key = randomBytes(32).toString("base64");

  test("encrypts and decrypts data successfully", () => {
    const plaintext = "sensitive payload";
    const encrypted = utils.encryptWithAES(key, plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    expect(utils.decryptWithAES(key, encrypted)).toBe(plaintext);
  });

  test("produces different ciphertext for the same plaintext", () => {
    const plaintext = "repeatable secret";
    const encryptedA = utils.encryptWithAES(key, plaintext);
    const encryptedB = utils.encryptWithAES(key, plaintext);

    expect(encryptedA).not.toBe(encryptedB);
    expect(utils.decryptWithAES(key, encryptedA)).toBe(plaintext);
    expect(utils.decryptWithAES(key, encryptedB)).toBe(plaintext);
  });

  test("returns null for malformed encrypted payloads", () => {
    expect(utils.decryptWithAES(key, "")).toBeNull();
    expect(utils.decryptWithAES(key, "deadbeef")).toBeNull();
  });

  test("decrypts legacy CBC payloads", () => {
    const plaintext = "legacy secret";
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", Buffer.from(key, "base64"), iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const legacyPayload = `${iv.toString("hex")}:${encrypted}`;

    expect(utils.decryptWithAES(key, legacyPayload)).toBe(plaintext);
  });
});

describe("utils.password helpers", () => {
  test("hashes and verifies passwords with bcrypt", async () => {
    const hashed = await utils.hashPassword("correct horse battery staple");

    expect(utils.isBcryptPasswordHash(hashed)).toBe(true);
    expect((await utils.verifyPassword(hashed, "correct horse battery staple")).valid).toBe(true);
    expect((await utils.verifyPassword(hashed, "nope")).valid).toBe(false);
  });
});

describe("utils.parseToolCalls", () => {
  test("extracts tool calls and removes wrapper tokens from the cleaned text", () => {
    const content = [
      "Before",
      "<|tool_calls_begin|>",
      '<|tool_call_begin|>lookup<|tool_sep|>{"id":42}<|tool_call_end|>',
      "</tool_calls>",
      "After"
    ].join(" ");

    expect(utils.parseToolCalls(content)).toEqual({
      cleanedText: "Before    After",
      toolCalls: [
        {
          name: "lookup",
          args: { id: 42 }
        }
      ]
    });
  });

  test("repairs truncated json arguments when possible", () => {
    const content = '<tool_call>search<tool_sep>{"query":"barnie"</tool_call>';

    expect(utils.parseToolCalls(content)).toEqual({
      cleanedText: "",
      toolCalls: [
        {
          name: "search",
          args: { query: "barnie" }
        }
      ]
    });
  });

  test("handles multiple tool calls and preserves surrounding text", () => {
    const content = [
      "Start",
      '<tool_call>first<tool_sep>{"step":1}</tool_call>',
      "middle",
      '<|tool_call_begin|>second<|tool_sep|>{"step":2}<|tool_call_end|>',
      "End"
    ].join(" ");

    expect(utils.parseToolCalls(content)).toEqual({
      cleanedText: "Start  middle  End",
      toolCalls: [
        {
          name: "first",
          args: { step: 1 }
        },
        {
          name: "second",
          args: { step: 2 }
        }
      ]
    });
  });
});
