const bcrypt = require("bcryptjs");
module.exports = {
  name: 'encrypt',
  description: 'Encrypts text',
  aliases: ['encriptar', 'encript', 'bcrypt'],
  execute: async function(message, args, lang) {
    let nomsg = 'Debes introducir el mensaje que deseas encriptar';
    const targetText = args.slice(0).join(" ");
    if (lang !== null) {
      if (lang.lang === 'en') {
        nomsg = 'You must enter the message you wish to encrypt';
      } else if (lang.lang === 'br') {
        nomsg = 'Você deve inserir a mensagem que deseja criptografar';
      }
    }
    if (!targetText) return message.reply(nomsg);
    const encrypted = bcrypt.hashSync(targetText, bcrypt.genSaltSync(10));
    message.reply(`Key: ${targetText}\n\nResult: ${encrypted}`);
  }
}