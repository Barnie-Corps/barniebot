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
    if (foundT) {
      if (type.toLowerCase() === "mins") {
        foundT.active = true;
        foundT.total = tt;
        foundT.left = 60 * tt;
        foundT.type = "mins";
        await foundT.save();
        reply(started);
    const interval2 = setInterval(async function() {
        const foundtt = await Time.findOne({ userid: message.author.id });
        if (foundtt.active === false) return;
        foundtt.left = foundtt.left - 1;
        await foundtt.save();
        if (foundtt.left === 0){
          const u = await client.users.fetch(foundtt.userid);
          let timeup = "El tiempo se ha acabado";
          let desk = "El tiempo establecido ha acabado, si deseas volver a establecerlo usa el comando del temporizador nuevamente";
          let tl = "Tiempo establecido";
          if (lang !== null && lang.lang !== "es") {
            if (lang.lang === "en") {
              timeup = "Time is up";
              desk = "The set time is over, if you want to reset it use the timer command again.";
              tl = "Established time";
            }
            else if (lang.lang === "br") {
              timeup = "O tempo se esgotou";
              desk = "O tempo definido expirou, se você desejar reinicializá-lo utilize novamente o comando do timer.";
              tl = "Tempo estabelecido";
            }
          }
          const embed =  new Discord.MessageEmbed()
          .setTitle(timeup)
          .setDescription(desk)
          .addField(tl, `${foundtt.total} ${foundtt.type}`)
          .setColor("PURPLE")
          .setTimestamp()
          clearInterval(interval2);
          foundtt.active = false;
          await foundtt.save();
          clearInterval(interval2)
          try {
            u.send({ embeds: [embed] });
          }
          catch (e) {
            console.log(e);
          }
        }
      }, 1000);
      }
      else if (type.toLowerCase() === "secs") {
        foundT.active = true;
        foundT.total = tt;
        foundT.left = tt;
        foundT.type = "secs";
        await foundT.save();
        reply(started);
    const interval2 = setInterval(async function() {
        const foundtt = await Time.findOne({ userid: message.author.id });
        if (foundtt.active === false) return;
        foundtt.left = foundtt.left - 1;
        await foundtt.save();
        if (foundtt.left === 0){
          const u = await client.users.fetch(foundtt.userid);
          let timeup = "El tiempo se ha acabado";
          let desk = "El tiempo establecido ha acabado, si deseas volver a establecerlo usa el comando del temporizador nuevamente";
          let tl = "Tiempo establecido";
          if (lang !== null && lang.lang !== "es") {
            if (lang.lang === "en") {
              timeup = "Time is up";
              desk = "The set time is over, if you want to reset it use the timer command again.";
              tl = "Established time";
            }
            else if (lang.lang === "br") {
              timeup = "O tempo se esgotou";
              desk = "O tempo definido expirou, se você desejar reinicializá-lo utilize novamente o comando do timer.";
              tl = "Tempo estabelecido";
            }
          }
          const embed =  new Discord.MessageEmbed()
          .setTitle(timeup)
          .setDescription(desk)
          .addField(tl, `${foundtt.total} ${foundtt.type}`)
          .setColor("PURPLE")
          .setTimestamp()
          clearInterval(interval2);
          foundtt.active = false;
          await foundtt.save();
          try {
            u.send({ embeds: [embed] });
          }
          catch (e) {
            console.log(e);
          }
        }
      }, 1000);
      }
      else if (type.toLowerCase() === "hrs") {
        foundT.active = true;
        foundT.total = tt;
        foundT.total = 60 * 60 * tt;
    const interval2 = setInterval(async function() {
        const foundtt = await Time.findOne({ userid: message.author.id });
        if (foundtt.active === false) return;
        foundtt.left = foundtt.left - 1;
        await foundtt.save();
        if (foundtt.left === 0){
          const u = await client.users.fetch(foundtt.userid);
          let timeup = "El tiempo se ha acabado";
          let desk = "El tiempo establecido ha acabado, si deseas volver a establecerlo usa el comando del temporizador nuevamente";
          let tl = "Tiempo establecido";
          if (lang !== null && lang.lang !== "es") {
            if (lang.lang === "en") {
              timeup = "Time is up";
              desk = "The set time is over, if you want to reset it use the timer command again.";
              tl = "Established time";
            }
            else if (lang.lang === "br") {
              timeup = "O tempo se esgotou";
              desk = "O tempo definido expirou, se você desejar reinicializá-lo utilize novamente o comando do timer.";
              tl = "Tempo estabelecido";
            }
          }
          const embed =  new Discord.MessageEmbed()
          .setTitle(timeup)
          .setDescription(desk)
          .addField(tl, `${foundtt.total} ${foundtt.type}`)
          .setColor("PURPLE")
          .setTimestamp()
          clearInterval(interval2);
          foundtt.active = false;
          await foundtt.save();
          try {
            u.send({ embeds: [embed] });
          }
          catch (e) {
            console.log(e);
          }
        }
      }, 1000);
      }
    }
    else {
      const newT = new Time();
      newT.active = true;
      newT.userid = message.author.id;
      newT.total = tt;
      if (type.toLowerCase() === "mins") {
        newT.left = 60 * tt;
        newT.type = "mins";
        await newT.save();
        reply(started);
    const interval2 = setInterval(async function() {
        const foundtt = await Time.findOne({ userid: message.author.id });
        if (foundtt.active === false) return;
        foundtt.left = foundtt.left - 1;
        await foundtt.save();
        if (foundtt.left === 0){
          const u = await client.users.fetch(foundtt.userid);
          let timeup = "El tiempo se ha acabado";
          let desk = "El tiempo establecido ha acabado, si deseas volver a establecerlo usa el comando del temporizador nuevamente";
          let tl = "Tiempo establecido";
          if (lang !== null && lang.lang !== "es") {
            if (lang.lang === "en") {
              timeup = "Time is up";
              desk = "The set time is over, if you want to reset it use the timer command again.";
              tl = "Established time";
            }
            else if (lang.lang === "br") {
              timeup = "O tempo se esgotou";
              desk = "O tempo definido expirou, se você desejar reinicializá-lo utilize novamente o comando do timer.";
              tl = "Tempo estabelecido";
            }
          }
          const embed =  new Discord.MessageEmbed()
          .setTitle(timeup)
          .setDescription(desk)
          .addField(tl, `${foundtt.total} ${foundtt.type}`)
          .setColor("PURPLE")
          .setTimestamp()
          clearInterval(interval2);
          foundtt.active = false;
          await foundtt.save();
          try {
            u.send({ embeds: [embed] });
          }
          catch (e) {
            console.log(e);
          }
        }
      }, 1000);
      }
      else if (type.toLowerCase() === "secs") {
        newT.left = tt;
        newT.type = "secs";
        await newT.save();
        reply(started);
    const interval2 = setInterval(async function() {
        const foundtt = await Time.findOne({ userid: message.author.id });
        if (foundtt.active === false) return;
        foundtt.left = foundtt.left - 1;
        await foundtt.save();
        if (foundtt.left === 0){
          const u = await client.users.fetch(foundtt.userid);
          let timeup = "El tiempo se ha acabado";
          let desk = "El tiempo establecido ha acabado, si deseas volver a establecerlo usa el comando del temporizador nuevamente";
          let tl = "Tiempo establecido";
          if (lang !== null && lang.lang !== "es") {
            if (lang.lang === "en") {
              timeup = "Time is up";
              desk = "The set time is over, if you want to reset it use the timer command again.";
              tl = "Established time";
            }
            else if (lang.lang === "br") {
              timeup = "O tempo se esgotou";
              desk = "O tempo definido expirou, se você desejar reinicializá-lo utilize novamente o comando do timer.";
              tl = "Tempo estabelecido";
            }
          }
          const embed =  new Discord.MessageEmbed()
          .setTitle(timeup)
          .setDescription(desk)
          .addField(tl, `${foundtt.total} ${foundtt.type}`)
          .setColor("PURPLE")
          .setTimestamp()
          clearInterval(interval2);
          foundtt.active = false;
          await foundtt.save();
          try {
            u.send({ embeds: [embed] });
          }
          catch (e) {
            console.log(e);
          }
        }
      }, 1000);
      }
      else if (type.toLowerCase() === "hrs") {
        newT.left = 60 * 60 * tt;
        newT.type = "hrs";
        await newT.save();
        reply(started);
    const interval2 = setInterval(async function() {
        const foundtt = await Time.findOne({ userid: message.author.id });
        if (foundtt.active === false) return;
        foundtt.left = foundtt.left - 1;
        await foundtt.save();
        if (foundtt.left === 0){
          const u = await client.users.fetch(foundtt.userid);
          let timeup = "El tiempo se ha acabado";
          let desk = "El tiempo establecido ha acabado, si deseas volver a establecerlo usa el comando del temporizador nuevamente";
          let tl = "Tiempo establecido";
          if (lang !== null && lang.lang !== "es") {
            if (lang.lang === "en") {
              timeup = "Time is up";
              desk = "The set time is over, if you want to reset it use the timer command again.";
              tl = "Established time";
            }
            else if (lang.lang === "br") {
              timeup = "O tempo se esgotou";
              desk = "O tempo definido expirou, se você desejar reinicializá-lo utilize novamente o comando do timer.";
              tl = "Tempo estabelecido";
            }
          }
          const embed =  new Discord.MessageEmbed()
          .setTitle(timeup)
          .setDescription(desk)
          .addField(tl, `${foundtt.total} ${foundtt.type}`)
          .setColor("PURPLE")
          .setTimestamp()
          clearInterval(interval2);
          foundtt.active = false;
          await foundtt.save();
          try {
            u.send({ embeds: [embed] });
          }
          catch (e) {
            console.log(e);
          }
        }
      }, 1000);
      }
    }
  }
}