import translate from "google-translate-api-x";
import Crypto from "crypto";
import * as async from "async";
const utils = {
    createArrows: (length: number): string => {
        let arrows = "";
        for (let i = 0; i < length; i++) {
            arrows += "^"
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
    translate: async (text: string, from: string, target: string): Promise<any> => {
        const result = await translate(text, { to: target, from });
        return result;
    },
    parallel: (functions: any): Promise<any[]> => {
        return new Promise((resolve, reject) => {
            if (typeof functions !== "object") reject(new TypeError("functions parameter must be of type object"));
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
            validKeys.push(k);
        }
        const translateObj: any = new Object;
        for (const vk of validKeys) {
            translateObj[vk] = async (done: any) => {
                const translation = (await utils.translate(obj[vk], language, target)).text;
                newObj[vk] = translation;
                done(null, true);
            }
        }
        await utils.parallel(translateObj);
        return newObj;
    },
    encryptWithAES: (key: string, data: string): string => {
        const cipher = Crypto.createCipher('aes-256-cbc', key);
        let crypted = cipher.update(data, 'utf8', 'hex');
        crypted += cipher.final('hex');
        return crypted;
    },
    decryptWithAES: (key: string, data: string): string | null => {
        try {
            const decipher = Crypto.createDecipher('aes-256-cbc', key);
            let dec = decipher.update(data, 'hex', 'utf8');
            dec += decipher.final('utf8');
            return dec;
        }
        catch (err) {
            return null;
        }
    },
    wait: async (time: number): Promise<void> => {
        return new Promise((resolve, reject) => {
            setTimeout(resolve, time);
        });
    }
};
export default utils;