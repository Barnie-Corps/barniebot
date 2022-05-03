const utils = require("../utils");
const bcrypt = require("bcryptjs");
module.exports = {
    name: "decrypt",
    description: "Decrypts text",
    aliases: ["decrypt", "descifrar", "descifrar", "bcrypt"],
    execute: async function (message, args, lang) {
        let nomsg = 'Debes introducir el mensaje que deseas desencriptar';
        let noalgorithm = "Debes introducir el algoritmo de encriptación";
        let nokey = "Debes introducir la clave de encriptación";
        let advMessage = "Este hash solo puede ser desencriptado con la misma clave de encriptación";
        let notSupported = "Este algoritmo no está soportado";
        const supportedAlgorithms = ["aes"];
        const targetText = args.slice(2).join(" ");
        const key = args[1];
        const algorithm = args[0];
        if (lang !== null) {
            if (lang.lang === 'en') {
                nomsg = 'You must enter the message you wish to decrypt';
                noalgorithm = 'You must enter the algorithm you wish to use';
                nokey = 'You must enter the key you wish to use';
                advMessage = 'This hash can only be decrypted with the same key';
                notSupported = 'This algorithm is not supported';
            }
            else if (lang.lang === 'br') {
                nomsg = 'Você deve inserir a mensagem que deseja decriptar';
                noalgorithm = 'Você deve inserir o algoritmo que deseja usar';
                nokey = 'Você deve inserir a chave que deseja usar';
                advMessage = 'Este hash só pode ser decriptado com a mesma chave';
                notSupported = 'Este algoritmo não é suportado';
            }
        }
        if (!algorithm) {
            return message.reply(noalgorithm);
        }
        if (!supportedAlgorithms.includes(algorithm.toLowerCase())) return message.reply(notSupported);
        if (!key) return message.reply(nokey);
        if (!targetText) return message.reply(nomsg);
        switch (algorithm.toLowerCase()) {
            case 'aes': {
                const decrypted = utils.decryptWithAES(key, targetText);
                if (decrypted === null) {
                    return message.reply(`${advMessage}`);
                }
                if (message.deletable) await message.delete();
                return message.channel.send(`${decrypted}`);
            }
        }
    }
}