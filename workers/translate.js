const { parentPort } = require("worker_threads");
const translate = require("google-translate-api-x");

const MAX_CONCURRENT = 5;
let inFlight = 0;
const queue = [];

async function run(text, from, to) {
    const timeout = 10000;
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeout);
    try {
        const result = await translate(text, { to, from, fetchOptions: { signal: controller.signal } });
        return result.text;
    } finally {
        clearTimeout(timeoutHandle);
    }
}

async function runWithSemaphore(text, from, to) {
    if (inFlight >= MAX_CONCURRENT) {
        await new Promise(resolve => queue.push(resolve));
    }
    inFlight++;
    try {
        return await run(text, from, to);
    } finally {
        inFlight--;
        if (queue.length > 0) queue.shift()();
    }
}

parentPort.on("message", async allData => {
    if (allData.data === "ping") {
        return parentPort.postMessage({ id: allData.id, type: "ping", pong: true });
    };
    const { text, from, to } = allData.data;
    try {
        parentPort.postMessage({ translation: await runWithSemaphore(text, from, to), id: allData.id });
    }
    catch (error) {
        const message = error && typeof error.message === "string" ? error.message : "Translation failed";
        parentPort.postMessage({ error: message, id: allData.id, type: "error" });
    }
});
