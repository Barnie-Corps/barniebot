const { parentPort } = require("worker_threads");

const processRateLimits = (users, limits, decrement) => {
  const activeUsers = [];
  const expiredUsers = [];
  const activeUsersSet = new Set();
  
  if (Array.isArray(users)) {
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      if (!u || typeof u.uid !== "string") continue;
      if (activeUsersSet.has(u.uid)) continue;
      
      const timeLeft = (typeof u.time_left === "number" ? u.time_left : 0) - decrement;
      
      if (timeLeft <= 0) {
        expiredUsers.push(u.uid);
      } else {
        activeUsers.push({ uid: u.uid, time_left: timeLeft });
        activeUsersSet.add(u.uid);
      }
    }
  }
  
  const activeLimits = [];
  const expiredLimits = [];
  const activeLimitsSet = new Set();
  
  if (Array.isArray(limits)) {
    for (let i = 0; i < limits.length; i++) {
      const l = limits[i];
      if (!l || typeof l.uid !== "string") continue;
      if (activeLimitsSet.has(l.uid)) continue;
      
      const timeLeft = (typeof l.time_left === "number" ? l.time_left : 0) - decrement;
      
      if (timeLeft <= 0) {
        expiredLimits.push({ 
          uid: l.uid, 
          username: typeof l.username === "string" ? l.username : "Unknown" 
        });
      } else {
        activeLimits.push({ 
          uid: l.uid, 
          time_left: timeLeft, 
          username: typeof l.username === "string" ? l.username : "Unknown" 
        });
        activeLimitsSet.add(l.uid);
      }
    }
  }
  
  return {
    users: { keep: activeUsers, expired: expiredUsers },
    limits: { keep: activeLimits, expired: expiredLimits }
  };
};

const handleMessage = (msg) => {
  if (!msg || typeof msg !== "object") {
    return null;
  }
  
  const messageId = msg.id;
  const messageData = msg.data || msg;
  
  if (messageData === "ping" || messageData.type === "ping") {
    return { id: messageId, type: "pong", timestamp: Date.now() };
  }
  
  if (messageData.type === "process") {
    const decrement = typeof messageData.decrement === "number" && messageData.decrement > 0 
      ? messageData.decrement 
      : 1000;
    
    const result = processRateLimits(
      messageData.users,
      messageData.limits,
      decrement
    );
    
    return {
      id: messageId,
      type: "processed",
      ...result,
      processingTime: Date.now()
    };
  }
  
  return {
    id: messageId,
    type: "error",
    error: "Unknown message type",
    receivedType: messageData.type
  };
};

parentPort.on("message", msg => {
  try {
    const response = handleMessage(msg);
    if (response) {
      parentPort.postMessage(response);
    }
  } catch (error) {
    parentPort.postMessage({
      id: msg?.id,
      type: "error",
      error: error.message || String(error),
      stack: error.stack
    });
  }
});
