import * as crypto from "crypto";
import * as async from "async";
import Workers from "./Workers";
import path from "path";
import db from "./mysql/database";
import { ChatSession } from "@google/generative-ai";
import * as nodemailer from "nodemailer";
import Log from "./Log";
import AIFunctions from "./AIFunctions";
import data from "./data";
import client from ".";
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: "santiadjmc@gmail.com",
    pass: process.env.EMAIL_PASSWORD
  },
});
const utils = {
  createArrows: (length: number): string => {
    let arrows = "";
    for (let i = 0; i < length; i++) {
      arrows += "^";
    }
    return arrows;
  },
  AIFunctions: {
    get_user_data: async (id: string): Promise<any> => {
      const user: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [id]);
      if (!user[0]) return { error: "User not found" };
      const language: any = await db.query("SELECT * FROM languages WHERE userid = ?", [id]);
      return { user: user[0], language: language[0] ?? "es" };
    },
    set_user_language: async (args: { userId: string; language: string }): Promise<any> => {
      if (!args.userId || !args.language) return { error: "Missing parameters" };
      const user: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [args.userId]);
      if (!user[0]) return { error: "User not found" };
      const language: any = await db.query("SELECT * FROM languages WHERE userid = ?", [args.userId]);
      if (!language[0]) {
        await db.query("INSERT INTO languages SET ?", [{ userid: args.userId, lang: args.language }]);
      } else {
        await db.query("UPDATE languages SET ? WHERE userid = ?", [{ lang: args.language }, args.userId]);
      }
      return { success: true };
    },
    fetch_url: async (args: { url: string }): Promise<any> => {
      if (!args.url) return { error: "Missing url parameter" };
      try {
        const response = await fetch(args.url);
        const text = await response.text();
        return { content: text };
      } catch (error) {
        return { error: "Failed to fetch URL" };
      }
    },
    retrieve_owners: (): string[] => {
      return data.bot.owners;
    },
    fetch_user: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const user: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [args.userId]);
      if (!user[0]) return { error: "User not found" };
      return { user: user[0] };
    },
    fetch_discord_user: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      let user;
      let validUser = true;
      try {
        user = await client.users.fetch(args.userId);
      } catch (error) {
        validUser = false;
      }
      if (validUser) {
        return { user };
      } else {
        return { error: "User not found" };
      }
    },
    get_memories: async (args: { userId: string }): Promise<any> => {
      if (!args.userId) return { error: "Missing userId parameter" };
      const memories: any = await db.query("SELECT * FROM ai_memories WHERE uid = ?", [args.userId]);
      return { memories: memories };
    },
    insert_memory: async (args: { userId: string; memory: string }): Promise<any> => {
      if (!args.userId || !args.memory) return { error: "Missing parameters" };
      await db.query("INSERT INTO ai_memories SET ?", [{ uid: args.userId, memory: args.memory }]);
      return { success: true };
    },
    fetch_ai_rules: async (): Promise<any> => {
      return require("./ai_rules.json").rules;
    },
    search_user_by_username: async (args: { username: string }): Promise<any> => {
      if (!args.username) return { error: "Missing username parameter" };
      const users: any = await db.query("SELECT * FROM discord_users WHERE username LIKE ?", [`%${args.username}%`]);
      return { users: users };
    },
    search_user_by_username_discord: async (args: { username: string }): Promise<any> => {
      if (!args.username) return { error: "Missing username parameter" };
      const users = client.users.cache.filter(u => u.username.toLowerCase().includes(args.username.toLowerCase()));
      return { users: Array.from(users.values()) };
    },
    update_user_data: async (args: { userId: string; data: any }): Promise<any> => {
      if (!args.userId || !args.data) return { error: "Missing parameters" };
      const user: any = await db.query("SELECT * FROM discord_users WHERE id = ?", [args.userId]);
      if (!user[0]) return { error: "User not found" };
      await db.query("UPDATE discord_users SET ? WHERE id = ?", [args.data, args.userId]);
      return { success: true };
    },
    execute_query: async (args: { query: string; }): Promise<any> => {
      if (!args.query) return { error: "Missing query parameter" };
      try {
        const result: any = await db.query(args.query);
        return { result };
      } catch (error: any) {
        return { error: error.message };
      }
    },
    on_guild: async (message: any): Promise<any> => {
      return { isGuild: message.guild !== null };
    },
    current_guild_info: async (message: any): Promise<any> => {
      if (!message.guild) return { error: "Not in a guild" };
      return { guild: { id: message.guild.id, name: message.guild.name, memberCount: message.guild.memberCount } };
    },
    guild_info: async (args: { guildId: string }): Promise<any> => {
      if (!args.guildId) return { error: "Missing guildId parameter" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      return { guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount } };
    },
    get_member_permissions: async (args: { guildId: string; memberId: string }): Promise<any> => {
      if (!args.guildId || !args.memberId) return { error: "Missing parameters" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      let member = guild.members.cache.get(args.memberId);
      if (!member) return { error: "Member not found" };
      return { permissions: member.permissions.toArray() };
    },
    get_member_roles: async (args: { guildId: string; memberId: string }): Promise<any> => {
      if (!args.guildId || !args.memberId) return { error: "Missing parameters" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      let member = guild.members.cache.get(args.memberId);
      if (!member) return { error: "Member not found" };
      return { roles: member.roles.cache.map(r => ({ id: r.id, name: r.name })) };
    },
    send_dm: async (args: { userId: string; content: string; }): Promise<any> => {
      if (!args.userId || !args.content) return { error: "Missing parameters" };
      let user;
      try {
        user = await client.users.fetch(args.userId);
      } catch (error) {
        return { error: "User not found" };
      }
      try {
        await user.send(args.content);
        return { success: true };
      } catch (error) {
        return { error: "Failed to send DM" };
      }
    },
    kick_member: async (args: { guildId: string; memberId: string; reason: string }): Promise<any> => {
      if (!args.guildId || !args.memberId || !args.reason) return { error: "Missing parameters" };
      const guild = client.guilds.cache.get(args.guildId);
      if (!guild) return { error: "Guild not found" };
      let member = guild.members.cache.get(args.memberId);
      if (!member) return { error: "Member not found" };
      try {
        await member.kick(args.reason);
        return { success: true };
      } catch (error) {
        return { error: "Failed to kick member" };
      }
    }
  },
  createSpaces: (length: number): string => {
    let spaces = "";
    for (let i = 0; i < length; i++) {
      spaces += " ";
    }
    return spaces;
  },
  createCensored: (length: number): string => {
    let censor = "";
    for (let i = 0; i < length; i++) {
      censor += "*";
    }
    return censor;
  },
  translate: async (text: string, from: string, target: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const worker = Workers.getAvailableWorker("translate") ?? (Workers.createWorker(path.join(__dirname, "workers/translate.js"), "translate") as unknown as { type: string; worker: Worker; id: string });
      const message = Workers.postMessage(worker.id, { text, from, to: target });
      Workers.on("message", async (data) => {
        if (data.id !== worker.id) return;
        if (data.message.id !== message) return;
        resolve({ text: data.message.translation });
      });
    });
  },
  parallel: (functions: any): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      if (typeof functions !== "object")
        reject(new TypeError("functions parameter must be of type object"));
      async.parallel(functions, (err, results) => {
        if (err) reject(err);
        else resolve(results as any[]);
      });
    });
  },
  autoTranslate: async (obj: any, language: string, target: string): Promise<typeof obj> => {
    if (typeof obj !== "object" || Array.isArray(obj)) throw new TypeError(`The autoTranslate function takes as first argument an object, got ${Array.isArray(obj) ? "Array" : typeof obj}`);
    if (typeof language !== "string") throw new TypeError(`The autoTranslate function takes as second argument a string, got ${typeof language}`);
    const keys = Object.keys(obj);
    const newObj = obj;
    const validKeys: string[] = [];
    for (const k of keys) {
      if (typeof obj[k] === "object" && !Array.isArray(obj)) {
        const newProperty = await utils.autoTranslate(obj[k], language, target);
        newObj[k] = newProperty;
        continue;
      }
      if (typeof obj[k] !== "string") continue;
      validKeys.push(k);
    }
    const translateObj: any = new Object();
    for (const vk of validKeys) {
      translateObj[vk] = async (done: any) => {
        await new Promise(async (resolve, reject) => {
          const worker = Workers.getAvailableWorker("translate") ?? (Workers.createWorker(path.join(__dirname, "workers/translate.js"), "translate", true) as unknown as { type: string; worker: Worker; id: string });
          const message = Workers.postMessage(worker.id, {
            text: obj[vk],
            from: language,
            to: target,
          });
          Workers.on("message", async (data) => {
            if (data.id !== worker.id) return;
            if (data.message.id !== message) return;
            newObj[vk] = data.message.translation;
            resolve(true);
          });
        });
        done(null, true);
      };
    }
    await utils.parallel(translateObj);
    return newObj;
  },
  encryptWithAES: (key: string, data: string): string => {
    const iv = Uint8Array.from(crypto.randomBytes(16));
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(key, "base64") as crypto.CipherKey,
      iv
    );
    let crypted = cipher.update(data, "utf8", "hex");
    crypted += cipher.final("hex");
    return iv.toString() + ":" + crypted;
  },
  decryptWithAES: (key: string, data: string): string | null => {
    const textParts = data.split(":");
    const ivHex = textParts.shift();
    if (!ivHex) return null;
    const encrypted = textParts.join(":");
    if (!encrypted) return null;
    const iv = Uint8Array.from(Buffer.from(ivHex, "hex"));
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(key, "base64") as crypto.CipherKey,
      iv
    );
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  },
  replaceNonLetters: (input: string): string => {
    const regex = /\*\*(.*?)\*\*/g;
    const result = input.replace(regex, "$1");
    return result;
  },
  // getAiResponse: async (text: string, lang: string, id: string, isStart: boolean): Promise<string> => {
  //   const modelId = "ChitChatterLdJSpZu";
  //   let texts = {
  //     mainMessage: "Habla en español",
  //     mainReply: "Ok, voy a hablar en español",
  //     instruction: "RECUERDA: No generes una respuesta que supere los 1800 caracteres"
  //   }
  //   if (lang !== "es") {
  //     texts = await utils.autoTranslate(texts, "es", lang);
  //     texts.mainMessage = (function () {
  //       const t = texts.mainMessage.trim().split(" ");
  //       t[2] = langs.where(1, lang)?.local as string;
  //       return t.join(" ");
  //     })();
  //     texts.mainReply = (function () {
  //       const t = texts.mainReply.trim().split(" ");
  //       t[6] = langs.where(1, lang)?.local as string;
  //       return t.join(" ");
  //     })();
  //   }
  //   const url = "https://www.blackbox.ai/api/chat";

  //   const getMessage = (content: string, role: string = "user") => {
  //     return {
  //       content: content,
  //       id,
  //       role: role,
  //       createdAt: new Date().toISOString()
  //     };
  //   };
  //   const sendRequest = async (args: string) => {
  //     const agentMode = {
  //       mode: true,
  //       id: modelId
  //     };

  //     const messages = [
  //       getMessage(texts.mainMessage),
  //       getMessage(texts.mainReply, "assistant"),
  //       getMessage(`${args}\n${texts.instruction}`)
  //     ];
  //     if (!isStart) messages.splice(0, 2);

  //     const responsePayload = {
  //       messages: messages,
  //       previewToken: null,
  //       codeModelMode: true,
  //       agentMode: agentMode,
  //       trendingAgentMode: {},
  //       isMicMode: false,
  //       maxTokens: 1024 / 2
  //     };

  //     try {
  //       const response = await fetch(url, {
  //         method: 'POST',
  //         headers: {
  //           'Content-Type': 'application/json',
  //           'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0'
  //         },
  //         body: JSON.stringify(responsePayload)
  //       });
  //       const result = (await response.text()).split("$@$")[2]
  //       return result;
  //     } catch (error: any) {
  //       console.error('Error sending request:', error.stack);
  //     }
  //   };
  //   return await sendRequest(text) as string;
  // },
  isVIP: async (id: string) => {
    const foundVip: any = await db.query("SELECT * FROM vip_users WHERE id = ?", [id]);
    if (!foundVip[0]) return false;
    else return true;
  },
  getAiResponse: async (prompt: string, chat: ChatSession) => {
    let result;
    try {
    result = await chat.sendMessage(prompt);
    } catch (error: any) {
      console.error("Error getting AI response:", error, error.stack);
      return { text: "Error: Could not get a response from the AI service. Please try again later.", call: null };
    }
    const response = result.response;
    const text = response.text();
    return { text, call: response.functionCalls()?.[0] ?? null };
  },
  sendEmail: async (to: string, subject: string, text: string, html?: string) => {
    if (!to || !subject || !text) throw new Error("Missing important data in utils.sendEmail");
    const data = await transporter.sendMail({
      from: '"BarnieCorps" <santiadjmc@gmail.com>',
      to,
      subject,
      text,
      html
    });
    if (data.rejected.length > 0) {
      Log.error(`${data.rejected.length}/${data.rejected.length + data.accepted.length} couldn't receive the email due to an unknown rejection by the SMTP server.`);
    }
  },
  sumNumbers: (numbers: number[]): number => {
    let sum = 0;
    for (const n of numbers) {
      sum += n;
    }
    return sum;
  }
};
export default utils;