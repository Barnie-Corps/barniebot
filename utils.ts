import translate from "google-translate-api-x";
import * as crypto from "crypto";
import * as async from "async";
import Workers from "./Workers";
import path from "path";
import langs from "langs";
const utils = {
  createArrows: (length: number): string => {
    let arrows = "";
    for (let i = 0; i < length; i++) {
      arrows += "^";
    }
    return arrows;
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
  translate: async (
    text: string,
    from: string,
    target: string
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const worker =
        Workers.getAvailableWorker("translate") ??
        (Workers.createWorker(
          path.join(__dirname, "workers/translate.js"),
          "translate"
        ) as unknown as { type: string; worker: Worker; id: string });
      const message = Workers.postMessage(worker.id, {
        text,
        from,
        to: target,
      });
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
  autoTranslate: async (
    obj: any,
    language: string,
    target: string
  ): Promise<typeof obj> => {
    if (typeof obj !== "object" || Array.isArray(obj))
      throw new TypeError(
        `The autoTranslate function takes as first argument an object, got ${Array.isArray(obj) ? "Array" : typeof obj
        }`
      );
    if (typeof language !== "string")
      throw new TypeError(
        `The autoTranslate function takes as second argument a string, got ${typeof language}`
      );
    const keys = Object.keys(obj);
    const newObj = obj;
    const validKeys: string[] = [];
    for (const k of keys) {
      if (typeof obj[k] === "object" && !Array.isArray(obj)) {
        const newProperty = await utils.autoTranslate(obj[k], language, target);
        newObj[k] = newProperty;
        continue;
      }
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
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(key, "base64"),
      iv
    );
    let crypted = cipher.update(data, "utf8", "hex");
    crypted += cipher.final("hex");
    return iv.toString("hex") + ":" + crypted;
  },
  decryptWithAES: (key: string, data: string): string | null => {
    const textParts = data.split(":");
    const iv = Buffer.from(textParts.shift() as string, "base64");
    const encrypted = textParts.join(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(key, "base64"),
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
  getAiResponse: async (text: string, lang: string, id: string): Promise<string> => {
    const modelId = "ChitChatterLdJSpZu";
    let texts = {
      mainMessage: "Habla en español",
      mainReply: "Ok, voy a hablar en español"
    }
    if (lang !== "es") {
      texts = await utils.autoTranslate(texts, "es", lang);
      texts.mainMessage = (function () {
        const t = texts.mainMessage.trim().split(" ");
        t[2] = langs.where(1, lang)?.local as string;
        return t.join(" ");
      })();
      texts.mainReply = (function () {
        const t = texts.mainReply.trim().split(" ");
        t[6] = langs.where(1, lang)?.local as string;
        return t.join(" ");
      })();
      console.log(texts);
    }
    const url = "https://www.blackbox.ai/api/chat";

    const getMessage = (content: string, role: string = "user") => {
      return {
        content: content,
        id,
        role: role,
        createdAt: new Date().toISOString()
      };
    };
    const sendRequest = async (args: string) => {
      const agentMode = {
        mode: true,
        id: modelId
      };

      const messages = [
        getMessage(texts.mainMessage),
        getMessage(texts.mainReply, "assistant"),
        getMessage(args)
      ];

      const responsePayload = {
        messages: messages,
        previewToken: null,
        codeModelMode: true,
        agentMode: agentMode,
        trendingAgentMode: {},
        isMicMode: false,
        maxTokens: 1024 / 2
      };

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0'
          },
          body: JSON.stringify(responsePayload)
        });
        const result = (await response.text()).split("$@$")[2]
        return result;
      } catch (error: any) {
        console.error('Error sending request:', error.stack);
      }
    };
    return await sendRequest(text) as string;
  }
};
export default utils;
