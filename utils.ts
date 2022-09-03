import translate from "google-translate-api-x";
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
    }
};
export default utils;