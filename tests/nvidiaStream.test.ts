declare var describe: any;
declare var test: any;
declare var expect: any;

import NVIDIAModelsManager from "../managers/NVIDIAModelsManager";

const makeManager = (create: (params: any, options: any) => any) => {
    const manager = new NVIDIAModelsManager(["test-key"]);
    const client = { key: "test-key", openai: { chat: { completions: { create } } } } as any;
    (manager as any).getNextClient = () => client;
    return manager;
};

describe("NIMChatSession.sendMessageStream", () => {
    test("rejects a pre-aborted signal without sending a request", async () => {
        let calls = 0;
        const manager = makeManager(() => { calls++; return (async function* () {})(); });
        const session = manager.CreateChatSession({ systemInstruction: "sys" });
        const controller = new AbortController();
        controller.abort();
        await expect(session.sendMessageStream!("hello", undefined, controller.signal)).rejects.toThrow();
        expect(calls).toBe(0);
        expect((session as any).messages.some((m: any) => m.role === "user")).toBe(false);
    });

    test("rejects instead of returning a partial answer when aborted mid-stream", async () => {
        const controller = new AbortController();
        const manager = makeManager((_params: any, options: any) => (async function* () {
            yield { choices: [{ delta: { content: "partial" } }] };
            controller.abort();
            if (options.signal.aborted) return;
            yield { choices: [{ delta: { content: " rest" } }] };
        })());
        const session = manager.CreateChatSession({ systemInstruction: "sys" });
        const chunks: string[] = [];
        await expect(session.sendMessageStream!("hello", d => chunks.push(d), controller.signal)).rejects.toThrow();
        expect(chunks).toEqual(["partial"]);
        expect((session as any).messages.some((m: any) => m.role === "user" || m.role === "assistant")).toBe(false);
    });

    test("returns the full answer when the stream completes", async () => {
        const manager = makeManager(() => (async function* () {
            yield { choices: [{ delta: { content: "hello " } }] };
            yield { choices: [{ delta: { content: "world" } }] };
        })());
        const session = manager.CreateChatSession({ systemInstruction: "sys" });
        const result = await session.sendMessageStream!("hi");
        expect(result.response.text()).toBe("hello world");
    });
});

describe("NIMChatSession context trimming", () => {
    test("drops whole tool blocks and terminates when the oldest message is an assistant tool call", async () => {
        const manager = makeManager(() => (async function* () {
            yield { choices: [{ delta: { content: "ok" } }] };
        })());
        const session = manager.CreateChatSession({ systemInstruction: "sys", maxContextMessages: 6 });
        session.primeTools!([{ name: "tool_a", args: {}, result: { ok: true } }, { name: "tool_b", args: {}, result: { ok: true } }]);
        for (let i = 0; i < 6; i++) {
            await session.sendMessageStream!(`message ${i}`);
        }
        const messages = (session as any).messages as any[];
        expect(messages.length).toBeLessThanOrEqual(8);
        const firstNonSystem = messages.find(m => m.role !== "system");
        expect(firstNonSystem.role).not.toBe("tool");
    });
});
