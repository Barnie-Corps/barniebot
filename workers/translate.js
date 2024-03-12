const { workerData, parentPort } = require("worker_threads");
const translate = require("google-translate-api-x");

async function run(text, from, to) {
    return (await translate(text, { to, from })).text;
}

parentPort.on("message", async allData => {
    const { text, from, to } = allData.data;
    parentPort.postMessage({ translation: await run(text, from, to), id: allData.id });
});