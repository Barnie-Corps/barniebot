const { workerData, parentPort } = require("worker_threads");
const translate = require("google-translate-api-x");

async function run(text, from, to) {
    return (await translate(text, { to, from })).text;
}

parentPort.on("message", async allData => {
    if (allData.data === "ping") {
        return parentPort.postMessage({ id: allData.id, type: "ping", pong: true });
    };
    const { text, from, to } = allData.data;
    try {
        parentPort.postMessage({ translation: await run(text, from, to), id: allData.id });
    }
    catch (error) {
        const message = error && typeof error.message === "string" ? error.message : "Translation failed";
        parentPort.postMessage({ error: message, id: allData.id });
    }
});