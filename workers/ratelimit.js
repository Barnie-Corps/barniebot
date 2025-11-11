const { parentPort } = require("worker_threads");

/**
 * Processes ratelimit and user message caches.
 * Expects: { type: "process", users: [{ uid, time_left }], limits: [{ uid, time_left, username }], decrement: number }
 * Returns: { type: "processed", users: { keep: [...], expired: [...] }, limits: { keep: [...], expired: [...] } }
 */
parentPort.on("message", msg => {
  if (!msg || msg.type !== "process") return;
  const decrement = typeof msg.decrement === "number" ? msg.decrement : 1000;
  const nowUsers = [];
  const expiredUsers = [];
  for (const u of msg.users || []) {
    const tl = u.time_left - decrement;
    if (tl <= 0) expiredUsers.push(u.uid); else nowUsers.push({ ...u, time_left: tl });
  }
  const nowLimits = [];
  const expiredLimits = [];
  for (const l of msg.limits || []) {
    const tl = l.time_left - decrement;
    if (tl <= 0) expiredLimits.push({ uid: l.uid, username: l.username }); else nowLimits.push({ ...l, time_left: tl });
  }
  parentPort.postMessage({
    id: msg.id,
    type: "processed",
    users: { keep: nowUsers, expired: expiredUsers },
    limits: { keep: nowLimits, expired: expiredLimits }
  });
});
