import translate from "google-translate-api-x";
import * as crypto from "crypto";
import * as async from "async";
import Workers from "./Workers";
import path from "path";
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
          const worker =
            Workers.getAvailableWorker("translate") ??
            (Workers.createWorker(
              path.join(__dirname, "workers/translate.js"),
              "translate"
            ) as unknown as { type: string; worker: Worker; id: string });
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
};
export default utils;
