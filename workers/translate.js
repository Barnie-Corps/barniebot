const { workerData, parentPort } = require("worker_threads");
const translate = require("google-translate-api-x");
const dns = require("dns");

// Windows DNS optimization - use verbatim for consistent ordering
if (process.platform === "win32") {
    dns.setDefaultResultOrder("verbatim");
}

// Cache for avoiding redundant lookups
const requestCache = new Map();
const CACHE_TTL = 60000; // 1 minute

async function run(text, from, to) {
    const cacheKey = `${from}:${to}:${text}`;
    const now = Date.now();
    const cached = requestCache.get(cacheKey);
    
    if (cached && cached.expires > now) {
        return cached.value;
    }
    
    // Increased timeout for Windows
    const timeout = process.platform === "win32" ? 20000 : 10000;
    
    const result = await Promise.race([
        translate(text, { to, from, fetchOptions: { timeout } }),
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Translation timeout")), timeout)
        )
    ]);
    
    const translatedText = result.text;
    requestCache.set(cacheKey, { value: translatedText, expires: now + CACHE_TTL });
    
    // Cleanup old cache entries
    if (requestCache.size > 100) {
        const toDelete = [];
        for (const [key, val] of requestCache.entries()) {
            if (val.expires <= now) toDelete.push(key);
        }
        toDelete.forEach(k => requestCache.delete(k));
    }
    
    return translatedText;
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