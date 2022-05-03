const bcrypt = require("bcryptjs");
const utils = require("../utils");
module.exports = {
  name: 'encrypt',
  description: 'Encrypts text',
  aliases: ['encriptar', 'encript', 'bcrypt'],
  execute: async function (message, args, lang) {
    let nomsg = 'Debes introducir el mensaje que deseas encriptar';
    let noalgorithm = "Debes introducir el algoritmo de encriptación";
    let nokey = "Debes introducir la clave de encriptación";
    let advMessage = "Este hash solo puede ser desencriptado con la misma clave de encriptación";
    let notSupported = "Este algoritmo no está soportado";
    const supportedAlgorithms = ["bcrypt", "aes"];
    const targetText = args.slice(1).join(" ");
    const key = args[1];
    const algorithm = args[0];
    if (lang !== null) {
      if (lang.lang === 'en') {
        nomsg = 'You must enter the message you wish to encrypt';
        noalgorithm = 'You must enter the algorithm you wish to use';
        nokey = 'You must enter the key you wish to use';
        advMessage = 'This hash can only be decrypted with the same key';
        notSupported = 'This algorithm is not supported';
      } else if (lang.lang === 'br') {
        nomsg = 'Você deve inserir a mensagem que deseja criptografar';
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
      case 'bcrypt': {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(targetText, salt);
        return message.reply(`${hash}`);
      }
      case 'aes': {
        if (message.deletable) await message.delete();
        const encrypted = utils.encryptWithAES(key, targetText);
        return message.channel.send(`${encrypted}\n\`${advMessage}\``);
      }
    }
  }
}