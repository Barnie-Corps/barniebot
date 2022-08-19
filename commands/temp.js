const Time = require('../models/temps');
const Discord = require('discord.js');
module.exports = {
  name: "temp",
  description: null,
  aliases: ["temporizador", "timer"],
  tier: 0,
  execute: async function(message, args, lang) {
    const foundT = await Time.findOne({ userid: message.author.id });
    function reply(content) {
      message.reply(content).catch(err => message.channel.send(`Error while replying\n\`${err}\``));
    }
    const { client, content, channel, author, guild } = message;
    let notime = "Debes introducir el tiempo";
    let notype = "Debes introducir el tipo de tiempo";
    let nonum = "El tiempo introducido debe ser un número entero";
    let nozero = "El tiempo debe ser mayor a 0";
    let invalidty = "El tipo de tiempo introducido es inválido, debe ser uno de los siguientes: mins, secs, hrs";
    let started = "El temporizador se ha iniciado con éxito, te avisaré cuando el tiempo acabe";
    if (lang !== null) {
      if (lang.lang !== "es");
      switch (lang.lang) {
        case "en":
        notime = "You must enter the time";
        notype = "You must enter the time type";
        nonum = "The time entered must be a whole number";
        nozero = "Time must be greater than 0";
        invalidty = "The type of time entered is invalid, it must be one of the following: mins, secs, hrs";
        started = "The timer has been successfully started, I will notify you when the time is up.";
        break;
        case "br":
        notime = "Você deve entrar o tempo";
        notype = "Você deve digitar o tipo de tempo";
        nonum = "O tempo inserido deve ser um número inteiro";
        nozero = "O tempo deve ser maior que 0";
        invalidty = "O tipo de tempo entrado é inválido, deve ser um dos seguintes: mins, secs, hrs";
        started = "O timer foi iniciado com sucesso, eu o notificarei quando o tempo acabar.";
        break;
      }
    }
    const time = args[0];
    const type = args[1];
    if (!time) return reply(notime);
    if (!type) return reply(notype);
    if (!Number.isInteger(Number(time))) return reply(nonum);
    const tt = Number(time);
    if (tt === 0 || tt < 0) return reply(nozero);
    const types = ["mins", "secs", "hrs"];
    if (!types.some(ty => type.toLowerCase().includes(ty))) return reply(invalidty);
    if (foundT) await foundT.delete();
      const newT = new Time();
      newT.active = true;
      newT.userid = message.author.id;
      newT.total = tt;
      if (type.toLowerCase() === "mins") {
        const now = new Date();
        newT.started = now;
        newT.finished = now+ (tt * 60000);
        newT.type = "mins";
        await newT.save();
        reply(started);
      }
      else if (type.toLowerCase() === "secs") {
        const now = Date.now();
        newT.started = now;
        newT.finished = now + (tt * 1000);
        newT.type = "secs";
        await newT.save();
        reply(started);
      }
      else if (type.toLowerCase() === "hrs") {
        const now = Date.now();
        newT.started = now;
        newT.finished = now + (tt * 3600000);
        newT.type = "hrs";
        await newT.save();
        reply(started);
      }
  }
}