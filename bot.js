const Discord = require('discord.js');
const { Configuration, OpenAIApi } = require("openai");
const config = new Configuration({
    apiKey: process.env.OPEN_KEY
});
const openai = new OpenAIApi(config);
/**
 * @param {string} text
 * @returns {string}
 */
function textToBin(text) {
  const length = text.length,
    output = [];
  for (let i = 0; i < length; i++) {
    const bin = text[i].charCodeAt().toString(2);
    output.push(Array(8 - bin.length + 1).join('0') + bin);
  }
  return output.join(' ');
}
const client = new Discord.Client({
  ws: {
    properties: {
      $browser: 'Discord Android',
    },
  },
  intents: ['GUILDS', 'GUILD_MESSAGES', 'GUILD_MEMBERS', 'GUILD_MESSAGE_REACTIONS', 'DIRECT_MESSAGES', 'GUILD_MEMBERS', 'GUILD_VOICE_STATES', 'GUILD_PRESENCES', "GUILD_INVITES"],
});
class Ai {
  /**
   * @param {string} msg
   */
  constructor(msg) {
    if (!msg) throw 'AIError: a message model must be provided';
    this.msg = msg;
  }
  /**
   * @param {string} message
   * @param {string} id
   * @returns {Promise<string>}
   */
  async getResponse(message, id) {
    if (!message || message === "") return console.log('AI: Cannot send an empty message to the API.');
   /*this.msg += `\nUser: ${message}\nBarnie:`;
    const response = await openai.createCompletion("text-davinci-001", {
        prompt: this.msg,
        temperature: 0.9,
        max_tokens: 150,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0.7,
        stop: ["User:"]
    });
    this.msg += response.data.choices[0].text;
    return response.data.choices[0].text;*/
    const response = await fetch(`http://localhost:3000/ai/barnie?id=${id}&msg=${message.replace(/ /g, "%20").replaceAll("+", "%2B").replaceAll("?", "%3F")}`);
    const rsp = await response.json();
    return rsp.response;
  }
}
/**
 * @param {number} length
 * @returns {string}
 */
function genString(length) {
  let char = '';
  const chars = 'aAbBcCdDe.EfFgGh6HiIj$JkK.lL4mMn$N.o$OpP2qQrRsS7tTu$UvVwW1xXyYzZ';
  for (let i = 0; i < length; i++) {
    char += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return char;
}
const data = require('./data.json');
const { print } = require('npm-unknown');
const { inspect } = require('util');
const fs = require('fs-extra');
const fetch = require('node-fetch');
// https://discord.com/oauth2/authorize?client_id=863133302068084757&scope=bot%20application.commands&permissions=8
const Prefixes = require('./models/prefixes');
const Lang = require('./models/langs');
const Economy = require('./models/economy');
const User = require('./models/users');
const Msg = require('./models/messages');
const Ia = require('./models/ia');
const Filter = require('./models/filter');
const Notice = require('./models/notices');
const Black = require('./models/blacklist');
const bcrypt = require('bcryptjs');
const Warn = require('./models/warns');
const Chat = require('./models/chat');
const Cmd = require('./models/customcmds');
const Time = require('./models/temps');
const Employee = require("./models/clynet_employees");
const loadingdc = '<a:discordproloading:875107406462472212>';
const Log = require("./models/logs");
async function botlog(text) {
  const target = await client.channels.fetch('789294581333884948');
  target.send(text);
}
let commands = new Discord.Collection();
const cmdDir = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const cmd of cmdDir) {
  try {
    const command = require(`./commands/${cmd}`);
    commands.set(command.name, command);
    console.log(`Sucessfully loaded command file '${cmd}'`);
  }
  catch (error) {
    console.log(`Error while loading command file ${cmd}\n\nError: ${error}`);
  }
}
const cemojis = {
  loading: {
    emoji: loadingdc,
    name: 'discordproloading',
    id: '875107406462472212',
  },
  thumbup: '👍',
  thumbdown: '👎',
  no: {
    emoji: '<a:marcasi:800125816633557043>',
    name: 'marcasi',
    id: '800125816633557043',
  },
};
client.cemojis = cemojis;
client.on('ready', async () => {
  print('Barnie successfully started.');
  await client.user.setPresence({ activities: [{ name: 'Connecting...' }], status: 'idle' });
  await client.user.setStatus('idle');
  const totalai = await Ia.find();
  let num = 0;
  totalai.forEach(async user => {
    user.active = false;
    await user.save();
    num = num + 1;
  });
  const checkInterval = setInterval(async function () {
    if (num === totalai.length) {
      clearInterval(checkInterval);
      print(`Set ${num} users as AI off.`);
    }
  }, 100);
  let coumt = 0;
  const interval = setInterval(async function () {
    clearInterval(interval);
    for (const g of client.guilds.cache.values()) {
      coumt += g.memberCount;
    }
    const activities2 = [`${coumt} users woah`, `${client.guilds.cache.size} Guilds / Servidores`];
    await client.user.setPresence({ activities: [{ name: activities2[Math.floor(Math.random() * activities2.length)] }], status: 'online' });
    setInterval(async function () {
      coumt = 0;
      for (const g of client.guilds.cache.values()) {
        coumt += g.memberCount;
      }
      const activities = [`${coumt} users woah`, `${client.guilds.cache.size} Guilds / Servidores`];
      if (client.user.presence.activities.find(ac => ac.name === 'Reconnecting...')) return;
      await client.user.setPresence({ activities: [{ name: activities[Math.floor(Math.random() * activities.length)] }], status: 'online' });
    }, 15000);
  }, 10);
  const times = await Time.find();
  for (const time of times) {
    if (time.left !== 0 && time.active === true) {
      const interval2 = setInterval(async function () {
        const tt = await Time.findOne({ userid: time.userid });
        if (tt.active === false) return;
        tt.left = tt.left - 1;
        await tt.save();
        if (tt.left === 0) {
          const u = await client.users.fetch(tt.userid);
          const foundL = await Lang.findOne({ userid: tt.userid });
          let timeup = 'El tiempo se ha acabado';
          let desk = 'El tiempo establecido ha acabado, si deseas volver a establecerlo usa el comando del temporizador nuevamente';
          let tl = 'Tiempo establecido';
          if (foundL && foundL.lang !== 'es') {
            if (foundL.lang === 'en') {
              timeup = 'Time is up';
              desk = 'The set time is over, if you want to reset it use the timer command again.';
              tl = 'Established time';
            }
            else if (foundL.lang === 'br') {
              timeup = 'O tempo se esgotou';
              desk = 'O tempo definido expirou, se você desejar reinicializá-lo utilize novamente o comando do timer.';
              tl = 'Tempo estabelecido';
            }
          }
          const embed = new Discord.MessageEmbed()
            .setTitle(timeup)
            .setDescription(desk)
            .addField(tl, `${tt.total} ${tt.type}`)
            .setColor('PURPLE')
            .setTimestamp();
          clearInterval(interval2);
          tt.active = false;
          await tt.save();
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
});
client.on('guildCreate', async guild => {
  let defc = 'none';
  guild.channels.cache.forEach(channel => {
    if (channel.type === 'GUILD_TEXT' && defc === 'none') return defc = channel;
  });
  await guild.members.fetch();
  const invite = await defc.createInvite({ maxAge: 0 });
  await botlog(`Me han añadido a un nuevo servidor\n\nMombre del servidor: ${guild.name}\n\nMiembros: ${guild.memberCount - 1}\n\nInvite: https://discord.gg/${invite.code}`);
  await defc.send('hello :D');
  try {
    await guild.me.setNickname('[b.] Barnie');
  }
  catch (err) {
    await botlog(`Error while changing my nickname in ${guild.name}\n\`${err}\``);
  }
});
client.on('messageCreate', async message => {
  if (!message.guild) return;
  let prefix;
  const LocalPrefix = await Prefixes.findOne({ guildid: message.guild.id });
  if (LocalPrefix) {
    prefix = LocalPrefix.prefix;
  }
  else {
    prefix = data.prefix;
  }
  function reply(content) {
    return message.reply(content).catch(error => message.channel.send(`Error while replying: \n\`${error}\``));
  }
  const channel = message.channel;
  const content = message.content;
  const author = message.author;
  const guild = message.guild;
  if (author.bot) return;
  const foundL = await Lang.findOne({ userid: author.id });
  const foundB = await Black.findOne({ userid: author.id });
  const args = content.slice(prefix.length).trim().split(/ +/g);
  const fioundu = await User.findOne({ userid: author.id });
  const msgs = await Msg.find();
  if (msgs.length < 1) {
    const newMsg = new Msg();
    newMsg.count = 1;
    await newMsg.save();
  }
  else {
    msgs[0].count = msgs[0].count + 1;
    await msgs[0].save();
  }
  if (fioundu) {
    fioundu.avatar = author.displayAvatarURL({ dynamic: true });
    fioundu.tag = author.tag;
    fioundu.messages = fioundu.messages + 1;
    await fioundu.save();
  }
  else {
    const newUser = new User();
    newUser.userid = author.id;
    newUser.avatar = author.displayAvatarURL({ dynamic: true });
    newUser.messages = 1;
    newUser.tag = author.tag;
    await newUser.save();
    console.log('[!] New user registered in the DB.\nTag: ' + author.tag + `\nChannel of the message: ${message.channel.name}\nGuild: ${message.guild.name}`);
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase())) {
    let sib = 'Te encuentras en la black list, no puedes usar mis comandos.';
    if (foundL) {
      switch (foundL.lang) {
        case 'en':
          sib = 'You are on the black list, you cannot use my commands.';
          break;
        case 'br':
          sib = 'Você está na lista negra, não pode usar meus comandos.';
          break;
      }
    }
    if (foundB && foundB.blocked === true) return reply(sib);
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'invite') || content.toLowerCase().startsWith(prefix.toLowerCase() + 'invitar')) {
    let desc = 'Puedes invitarme a tu servidor dando click [aquí]';
    let title = '¿Quieres añadirme a tu servidor?';
    let footer = 'Todos los derechos reservados.';
    if (foundL) {
      if (foundL.lang === 'en') {
        title = 'Do you want to add me to your server?';
        desc = 'You can invite me to your server by clicking [here]';
        footer = 'All rights reserved.';
      }
      else if (foundL.lang === 'br') {
        title = 'Você quer me adicionar ao seu servidor?';
        desc = 'Você pode me convidar para o seu servidor clicando [aqui]';
        footer = 'Todos os direitos reservados.';
      }
    }
    const inviteEmbed = new Discord.MessageEmbed()
      .setTitle(title)
      .setDescription(`${desc}(https://discord.com/oauth2/authorize?client_id=900723711840251924&scope=bot%20applications.commands&permissions=8)\n\n- [Donate](https://paypal.me/EzequielValdez746?locale.x=es_XC)`)
      .setColor('PURPLE')
      .setTimestamp()
      .setFooter(`Barnie Corps © 2021 - 2025 ${footer}`);
    message.reply({ embeds: [inviteEmbed] });
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'help') || content.toLowerCase().startsWith(prefix.toLowerCase() + 'ayuda')) {
    let embedTitle = 'Secciones';
    let embedDesc = 'Reacciona para ver las distintas secciones\n\n🏠 - Secciones (actual página)\n🎮 - Entretenimiento\n🔒 - Moderación\n📌 - info\n🔰 - Utilidad\n📎 - Soporte\n💼 - Economía';
    let entTitle = 'Entretenimiento';
    let modTitle = 'Moderación';
    let infoTitle = 'Info';
    let utiTitle = 'Utilidad';
    let supTitle = 'Soporte';
    let setlangDesc = 'Este comando sirve para establecer el lenguaje en que quieres que el bot te responda.';
    let balDesc = 'Este comando sirve para ver tu dinero.';
    let workDesc = 'Este comando sirve para trabajar y conseguir dinero.';
    let iaDesc = 'Este comando sirve para charlar con la inteligencia artificial';
    let setpDesc = 'Este comando sirve para establecer el prefijo al que quieren que el bot responda.';
    let filtDesc = 'Este comando sirve para editar el filtro del servidor.';
    let filtUse = 'Ejemplos de uso:';
    let ecoTitle = 'Economía';
    let noticeDesc = 'Sirve para establecer el canal en que desee recibir noticias sobre actualizaciones o mantenimientos del bot.';
    let userlistdesc = 'Sirve para obtener un archivo con todos los usuarios de la caché.';
    let warndesc = 'Sirve para dar una advertencia a algún usuario.';
    let warnviewdesc = 'Sirve para ver las advertencias de cualquier usuario.';
    let clearwarnsdesc = 'Sirve para borrar todas las advertencias de un usuario.';
    let encryptDesc = 'Sirve para encriptar texto';
    let genpassDesc = 'Sirve para generar una contraseña segura y única.';
    let gethtmlDesc = 'Sirve para obtener el código html de cualquier página';
    let statsDesc = 'Sirve para ver las estadísticas del bot';
    let pingDesc = 'Sirve para ver el ping (en ms) del bot';
    let chatDesc = 'Sirve para establecer el canal del chat global.';
    let topDesc = 'Sirve para ver el top 5 de usuarios con más mensajes contados por el bot.';
    let userinfoDesc = 'Sirve para ver tu información o la del usuario mencionado';
    let customDesc = 'Sirve para crear comandos custom en el servidor';
    let ticketDesc = 'Sirve para crear tickets de soporte que son atendidos por nuestros Staffs.';
    let tempDesc = 'Sirve para esteblecer un temporizador, una vez acabado el tiempo el bot te avisará enviándote un mensaje al DM.';
    let sayDesc = "Sirve para hacer que el bot envíe un mensaje en el canal actual";
    let avatarDesc = "Sirve para ver tu avatar o el de algún otro usuario (Proporcionar una ID hará que se muestre el avatar de ese usuario sin importar que no esté en el servidor)";
    let clearDesc = "Sirve para eliminar hasta 100 mensajes en un segundo";
    let footer = 'Todos los derechos reservados.';
    if (foundL) {
      if (foundL.lang === 'en') {
        clearDesc = "Deletes up to 100 messages in one second";
        sayDesc = "Used to make the bot send a message on the current channel.";
        avatarDesc = "It is used to see your avatar or another user's avatar (Providing an ID will show that user's avatar no matter if he/she is not on the server).";
        infoTitle = 'Info';
        modTitle = 'Moderation';
        entTitle = 'Entertainment';
        utiTitle = 'Utility';
        supTitle = 'Support';
        embedTitle = 'Sections';
        setlangDesc = 'This command is used to establish the language in which you want the bot to respond to you.';
        embedDesc = 'React to see the different sections \n\n🏠 - Sections (current page) \n🎮 - Entertainment \n🔒 - Moderation \n📌 - info \n🔰 - Utility \n📎 - Support\n💼 - Economy';
        balDesc = 'This command is used to see your money';
        workDesc = 'This command is used to work and earn money.';
        iaDesc = 'This command is used to chat with the artificial intelligence';
        setpDesc = 'This command is used to set the prefix to which you want the bot to respond.';
        ecoTitle = 'Economy';
        filtDesc = 'This command is used to edit the server filter.';
        noticeDesc = 'It is used to establish the channel in which you want to receive news about updates or maintenance of the bot.';
        filtUse = 'Usage examples:';
        userlistdesc = 'It is used to obtain a file with all the users in the cache.';
        warndesc = 'It is used to give a warning to any user.';
        warnviewdesc = 'It is used to see the warnings of any user.';
        clearwarnsdesc = 'It is used to erase all the warnings of a user.';
        encryptDesc = 'Used to encrypt text';
        genpassDesc = 'It is used to generate a strong and unique password.';
        gethtmlDesc = 'It is used to obtain the html code of any page';
        statsDesc = 'It is used to see the bot\'s statistics';
        pingDesc = 'Used to see the ping (in ms) of the bot';
        chatDesc = 'Used to set the global chat channel.';
        topDesc = 'It is used to see the top 5 users with the most messages counted by the bot.';
        userinfoDesc = 'It is used to view your information or that of the mentioned user.';
        customDesc = 'Used to create custom commands in the server';
        ticketDesc = 'It is used to create support tickets that are attended by our Staffs.';
        tempDesc = 'It is used to set a timer, once the time is up the bot will notify you by sending you a message to the DM.';
        footer = 'All rights reserved.';
      }
      else if (foundL.lang === 'br') {
        clearDesc = "Elimina até 100 mensagens em um segundo";
        sayDesc = "Usado para fazer o bot enviar uma mensagem no canal atual.";
        avatarDesc = "Use para visualizar seu avatar ou o avatar de outro usuário (Fornecer uma ID mostrará o avatar desse usuário, independentemente de ele estar ou não no servidor).";
        infoTitle = 'Informações';
        modTitle = 'Moderação';
        entTitle = 'Entretenimiento';
        embedTitle = 'Seções';
        utiTitle = 'Utilitário';
        supTitle = 'Suporte';
        setlangDesc = 'Este comando é usado para definir o idioma no qual você deseja que o bot responda a você.';
        embedDesc = 'Reaja para ver as diferentes seções \n\n🏠 - Seções (página atual) \n🎮 - Entretenimento \n🔒 - Moderação \n📌 - Informações \n🔰 - Utilitário \n📎 - Suporte\n💼 - Economia';
        balDesc = 'Este comando é usado para ver seu dinheiro.';
        workDesc = 'Este comando é usado para trabalhar e obter dinheiro.';
        ecoTitle = 'Economia';
        iaDesc = 'Este comando é usado para conversar com a inteligência artificial';
        setpDesc = 'Este comando é usado para definir o prefixo ao qual você deseja que o bot responda.';
        filtDesc = 'Este comando é usado para editar o filtro do servidor.';
        filtUse = 'Exemplos de uso:';
        noticeDesc = 'É usado para estabelecer o canal no qual você deseja receber notícias sobre atualizações ou manutenção do bot.';
        footer = 'Todos os direitos reservados.';
        userlistdesc = 'É usado para obter um arquivo com todos os usuários do cache.';
        warndesc = 'É usado para avisar o usuário.';
        warnviewdesc = 'É usado para ver os avisos de qualquer usuário.';
        clearwarnsdesc = 'É usado para apagar todos os avisos de um usuário.';
        encryptDesc = 'Usado para criptografar texto';
        genpassDesc = 'É usado para gerar uma senha forte e única.';
        gethtmlDesc = 'É usado para obter o código html de qualquer página';
        statsDesc = 'É usado para ver as estatísticas do bot';
        pingDesc = 'Usado para ver o ping (em ms) do bot';
        chatDesc = 'Usado para definir o canal de bate-papo global.';
        topDesc = 'É usado para ver os 5 principais usuários com o maior número de mensagens contadas pelo bot.';
        userinfoDesc = 'Utilizado para visualizar suas informações ou as do usuário nomeado.';
        customDesc = 'Usado para criar comandos personalizados no servidor';
        ticketDesc = 'Ele é usado para criar bilhetes de suporte que são respondidos por nossos Staffs.';
        tempDesc = 'Ele é usado para definir um temporizador, uma vez que o tempo acabar o bot irá notificá-lo, enviando-lhe uma mensagem para o DM.';
      }
    }
    const embed = new Discord.MessageEmbed()
      .setTitle(`${embedTitle} :robot:`)
      .setDescription(embedDesc)
      .setFooter(`Barnie Corps © 2021 - 2025 ${footer}`)
      .setColor('PURPLE');
    const entre = new Discord.MessageEmbed()
      .setTitle(`${entTitle} 🎮`)
      .addField(prefix + 'ia', iaDesc)
      .addField(prefix + 'setchat', chatDesc)
      .setFooter(`Barnie Corps © 2021 - 2025 ${footer}`)
      .setColor('PURPLE');
    const mod = new Discord.MessageEmbed()
      .setTitle(`${modTitle} 🔒`)
      .addField(prefix + 'filter', `${filtDesc}\n\n${filtUse}\n` + '```js\n' + prefix + 'filter on\n\n' + prefix + 'filter off\n\n' + prefix + 'filter add penis\n\n' + prefix + 'filter remove penis\n```')
      .addField(prefix + 'warn', warndesc)
      .addField(prefix + 'viewwarns', warnviewdesc)
      .addField(prefix + 'clearwarns', clearwarnsdesc)
      .setFooter(`Barnie Corps © 2021 - 2025 ${footer}`)
      .setColor('PURPLE');
    const info = new Discord.MessageEmbed()
      .setTitle(`${infoTitle} 📌`)
      .addField(prefix + 'setupdates', noticeDesc)
      .addField(prefix + 'botinfo', statsDesc)
      .addField(prefix + 'ping', pingDesc)
      .addField(prefix + 'top', topDesc)
      .setFooter(`Barnie Corps © 2021 - 2025 ${footer}`)
      .setColor('PURPLE');
    const uti = new Discord.MessageEmbed()
      .setTitle(`${utiTitle} 🔰`)
      .addField(prefix + 'setlang', setlangDesc)
      .addField(prefix + 'setprefix', setpDesc)
      .addField(prefix + 'genpass', genpassDesc)
      .addField(prefix + 'gethtml', gethtmlDesc)
      .addField(prefix + 'encrypt', encryptDesc)
      .addField(prefix + 'customcmd', customDesc)
      .addField(prefix + 'userinfo', userinfoDesc)
      .addField(prefix + 'temp', tempDesc)
      .addField(prefix + 'say', sayDesc)
      .addField(prefix + 'avatar', avatarDesc)
      .addField(prefix + 'clear', clearDesc)
      .setFooter(`Barnie Corps © 2021 - 2025 ${footer}`)
      .setColor('PURPLE');
    const sup = new Discord.MessageEmbed()
      .setTitle(`${supTitle} 📎`)
      .addField(prefix + 'ticket', ticketDesc)
      .setFooter(`Barnie Corps © 2021 - 2025 ${footer}`)
      .setColor('PURPLE');
    const eci = new Discord.MessageEmbed()
      .setTitle(`${ecoTitle} 💼`)
      .addField(prefix + 'bal', balDesc)
      .addField(prefix + 'work', workDesc)
      .setFooter(`Barnie Corps © 2021 - 2025 ${footer}`)
      .setColor('PURPLE');
    const sentMsg = await reply({ embeds: [embed] }).catch(error => message.channel.send(`Error while replying: \n\`${error}\``));
    sentMsg.react('🏠');
    sentMsg.react('🎮');
    sentMsg.react('🔒');
    sentMsg.react('📌');
    sentMsg.react('🔰');
    sentMsg.react('📎');
    sentMsg.react('💼');
    sentMsg.react('❌');
    const filter = (reaction, user) => !user.bot;
    const collector = sentMsg.createReactionCollector(filter);
    collector.on('collect', async (reaction, user) => {
      if (user.bot) return;
      if (user.id !== message.author.id) return reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``));
      if (reaction.emoji.name === '🎮') {
        await sentMsg.edit({ embeds: [entre] });
        await reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``));
      }
      else if (reaction.emoji.name === '🏠') {
        await sentMsg.edit({ embeds: [embed] });
        if (guild.me.permissions.has("MANAGE_MESSAGES")) await reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``));
      }
      else if (reaction.emoji.name === '🔒') {
        reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``));
        sentMsg.edit({ embeds: [mod] });
      }
      else if (reaction.emoji.name === '📌') {
        await sentMsg.edit({ embeds: [info] });
        if (guild.me.permissions.has("MANAGE_MESSAGES")) await reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``));
      }
      else if (reaction.emoji.name === '🔰') {
        await sentMsg.edit({ embeds: [uti] });
        if (guild.me.permissions.has("MANAGE_MESSAGES")) await reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``));
      }
      else if (reaction.emoji.name === '📎') {
        await sentMsg.edit({ embeds: [sup] });
        if (guild.me.permissions.has("MANAGE_MESSAGES")) await reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``));
      }
      else if (reaction.emoji.name === '❌') {
        if (guild.me.permissions.has("MANAGE_MESSAGES")) sentMsg.reactions.removeAll().catch(err => console.log(`Error while deleting reactions\n\`${err}\``));
        collector.stop();
      }
      else if (reaction.emoji.name === '💼') {
        await sentMsg.edit({ embeds: [eci] });
        if (guild.me.permissions.has("MANAGE_MESSAGES")) await reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``));
      }
      else if (reaction.emoji.name !== '🏠' && reaction.emoji.name !== '🔒' && reaction.emoji.name !== '📌' && reaction.emoji.name !== '🔰' && reaction.emoji.name !== '📎' && reaction.emoji.name !== '❌' && reaction.emoji.name !== '💼') { if (guild.me.permissions.has("MANAGE_MESSAGES")) return reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``)); }
    });
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'setlang')) {
    const targetL = args[1];
    let notarget = 'Debes introducir el lenguaje que quieres establecer';
    let lengthLimit = 'El lenguaje no puede tener más de 2 carácteres.';
    let nolang = 'Ese lenguaje es inválido\nLenguajes disponibles: br, en, es';
    if (foundL) {
      if (foundL.lang === 'en') {
        notarget = 'You must enter the language you want to stablish';
        lengthLimit = 'The language cannot have more than 2 characters.';
        nolang = 'That language is invalid \nAvailable languages: br, en, es';
      }
      else if (foundL.lang === 'br') {
        notarget = 'Você deve inserir o idioma que deseja definir';
        lengthLimit = 'O idioma não pode ter mais de 2 caracteres.';
        nolang = 'Esse idioma é inválido \nLinguagens disponíveis: br, en, es';
      }
    }
    if (!targetL) return message.reply(`<a:alertapro:869607044892741743> - ${notarget}`);
    if (targetL.length > 2) return message.reply(`<a:alertapro:869607044892741743> - ${lengthLimit}`);
    if (targetL.toLowerCase() !== 'br' && targetL.toLowerCase() !== 'en' && targetL.toLowerCase() !== 'es') return message.reply(`<a:alertapro:869607044892741743> - ${nolang}`);
    let dondemsg = 'Lenguaje establecido con éxito en';
    let lang = 'español';
    if (targetL.toLowerCase() === 'en') {
      dondemsg = 'Language successfully established in';
      lang = 'english';
    }
    else if (targetL.toLowerCase() === 'br') {
      dondemsg = 'Idioma estabelecido com sucesso em';
      lang = 'português';
    }
    if (!foundL) {
      const newl = new Lang();
      newl.userid = author.id;
      newl.lang = targetL.toLowerCase();
      await newl.save();
      message.reply(`${dondemsg} **${lang}**`);
    }
    else {
      foundL.lang = targetL.toLowerCase();
      await foundL.save();
      message.reply(`${dondemsg} **${lang}**`);
    }
  }
  const eco = await Economy.findOne({ userid: author.id });
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'bal') || content.toLowerCase().startsWith(prefix.toLowerCase() + 'balance')) {
    let noeco = 'No estás registrado en mi base de datos, regístrate diciendo';
    let embtitle = 'Dinero';
    let enman = 'En mano';
    let enbank = 'En banco';
    let footer = 'Todos los derechos reservados.';
    if (foundL) {
      if (foundL.lang === 'en') {
        noeco = 'You are not registered in my database, sign up saying';
        embtitle = 'Money';
        enman = 'Hand';
        enbank = 'Bank';
        footer = 'All rights reserved';
      }
      else if (foundL.lang === 'br') {
        noeco = 'Você não está cadastrado em meu banco de dados, inscreva-se dizendo';
        embtitle = 'dinheiro';
        enman = 'Em mão';
        enbank = 'No banco';
        footer = 'Todos os direitos reservados.';
      }
    }
    if (!eco) return message.reply(`${noeco} \`${prefix.toLowerCase()}work\``);
    const BalEmbed = new Discord.MessageEmbed()
      .setTitle(`${embtitle}`)
      .addField(enman, `:dollar: ${eco.hand_money}`)
      .addField(enbank, `:bank: ${eco.bank}`)
      .setFooter(`Barnie Corps © 2021 - 2025 ${footer}`)
      .setColor('PURPLE');
    message.reply({ embeds: [BalEmbed] });
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'work') || content.toLowerCase().startsWith(prefix.toLowerCase() + 'trabajar')) {
    const randomPaid = Math.floor(Math.random() * 110);
    let obtainTitle = '¡Buen trabajo!';
    let obtainDesc = 'Has trabajado duro y haz obtenido';
    let footer = 'Todos los derechos reservados.';
    if (foundL) {
      if (foundL.lang === 'en') {
        obtainTitle = 'Good work!';
        obtainDesc = 'You\'ve worked hard and got';
        footer = 'All rights reserved';
      }
      else if (foundL.lang === 'br') {
        obtainTitle = 'Bom trabalho!';
        obtainDesc = 'Você trabalhou duro e obteve';
        footer = 'Todos os direitos reservados.';
      }
    }
    const obtainEmbed = new Discord.MessageEmbed()
      .setTitle(obtainTitle)
      .setDescription(`${obtainDesc} :dollar:${randomPaid}`)
      .setColor('PURPLE')
      .setFooter(`Barnie Corps © 2021 - 2025 ${footer}`);
    if (!eco) {
      const neweco = new Economy();
      neweco.userid = author.id;
      neweco.hand_money = randomPaid;
      neweco.hand_item = 'none';
      neweco.bank = 0;
      neweco.items = [];
      neweco.friends = [];
      neweco.friend_requests = [];
      neweco.rank = 1;
      await neweco.save();
      message.reply({ embeds: [obtainEmbed] }).catch(err => message.channel.send(`Error while replying\n\`${err}\``));
    }
    else {
      eco.hand_money = eco.hand_money + randomPaid;
      await eco.save();
      message.reply({ embeds: [obtainEmbed] }).catch(err => message.channel.send(`Error while replying\n\`${err}\``));
    }
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'changerank')) {
    let noeco = 'No tienes autorización para usar este comando.';
    let notarget = 'Debes introducir la ID del objetivo';
    let nonum = 'El nuevo rango debe ser un número';
    let nonumid = 'El ID debe ser un número.';
    let norank = 'Debes introducir el nuevo rank.';
    let noid = 'No hay ningún usuario con esa ID en mi base de datos.';
    let changedone = false;
    let donemsg = 'He cambiado con éxito el rango de';
    const makemsg = (user) => {
      return `I have successfully changed **${user}**'s rank`;
    };
    if (foundL) {
      if (foundL.lang === 'en') {
        noeco = 'You are not authorized to use this command.';
        notarget = 'You must enter the target\'s ID';
        nonum = 'The new rank must be a number';
        nonumid = 'The ID must be a number';
        norank = 'You must enter the new rank.';
        noid = 'There is no user with that ID in my database.';
        changedone = true;
      }
      else if (foundL.lang === 'br') {
        noeco = 'Você não está autorizado a usar este comando.';
        notarget = 'Você deve inserir o ID de destino';
        nonum = 'O novo intervalo deve ser um número';
        norank = 'Debes introducir el nuevo rank.';
        nonumid = 'O ID deve ser um número.';
        noid = 'Não há nenhum usuário com esse ID em meu banco de dados.';
        donemsg = 'Eu mudei com sucesso a classificação de';
      }
    }
    if (!eco) return message.reply(noeco);
    if (eco.rank < 4) return message.reply(noeco);
    const target = args[1];
    const newrank = args[2];
    if (!target) return reply(notarget);
    if (!newrank) return reply(norank);
    if (isNaN(target)) return reply(nonumid);
    if (isNaN(newrank)) return reply(nonum);
    const ufound = await Economy.findOne({ userid: target });
    if (!ufound) return reply(noid);
    ufound.rank = Number(newrank);
    await ufound.save();
    const ea = await client.users.fetch(target);
    if (changedone === true) {
      donemsg = makemsg(ea.username);
      return reply(donemsg);
    }
    else {
      reply(`${donemsg} **${ea.username}**`);
    }
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'ia')) {
    //return message.reply(`403 - Command under maintenance`);
    let msg = "Bot en español llamado Barnie que puede contestar preguntas generales, resolver dudas de JavaScript, hacer búsquedas en google, resolver operaciones matemáticas, hacer traducciones y hablar con usuarios:";
    const foundAi = await Ia.findOne({ userid: author.id });
    const filter = m => m.author.id === author.id;
    let yamsg = 'Ya tienes a la inteligencia artificial funcionando.';
    let startedmsg = 'Has iniciado la inteligencia artificial, di `stop ai` para detenerla';
    let stoppedmsg = 'Inteligencia artificial detenida.';
    let errmsg = 'Son demaciados mensajes, espera un poco!';
    let tipIdioma = 'Puedes cambiar el idioma del bot con `b.setlang`';
    let tipIa = 'Puedes hablar con la inteligencia artificial en muchos idiomas';
    let tipIa2 = 'La inteligencia artificial tiene las mismas capacidades que cleverbot. (El de la página)';
    if (foundL) {
      if (foundL.lang === 'en') {
        yamsg = 'You already has the artificial intelligence working.';
        startedmsg = 'You have started artificial intelligence, say `stop ai` to stop it';
        stoppedmsg = 'Artificial intelligence stopped.';
        errmsg = 'There are too many messages, wait a bit!';
        tipIdioma = 'You can change the language with `b.setlang`';
        tipIa = 'You can talk to artificial intelligence in many languages';
        tipIa2 = 'Artificial intelligence has the same capabilities as cleverbot. (The one of the page)';
      }
      else if (foundL.lang === 'br') {
        yamsg = 'Você já tem a inteligência artificial funcionando.';
        startedmsg = 'Você iniciou a inteligência artificial, diga `stop ai` para pará-la';
        stoppedmsg = 'A inteligência artificial parou.';
        errmsg = 'Há muitas mensagens, espere um pouco!';
        tipIdioma = 'Você pode alterar o idioma do bot com `b.setlang`';
        tipIa = 'Você pode falar com a inteligência artificial em muitas línguas';
        tipIa2 = 'A inteligência artificial tem as mesmas capacidades do cleverbot (O da página)';
      }
    }
    const tips = [tipIdioma, tipIa, tipIa2];
    const cleverbot = new Ai(msg);
    if (foundAi) {
      if (foundAi.active === true) { return reply('<a:alertapro:869607044892741743> - ' + yamsg + `\n<#${foundAi.channelid}>`); }
      else {
        reply(startedmsg);
        foundAi.active = true;
        foundAi.channelid = channel.id;
        await foundAi.save();
        const collector1 = channel.createMessageCollector(filter);
        collector1.on('collect', async m => {
          if (m.author.id !== author.id) return;
          if (m.author.bot) return;
          if (m.content.toLowerCase() === 'stop ai') {
            foundAi.active = false;
            await foundAi.save();
            m.reply(stoppedmsg);
            return collector1.stop();
          }
          channel.sendTyping();
          const contenido = m.content;
          const rsp = await cleverbot.getResponse(contenido, m.author.id);
          m.reply(rsp);
        });
      }
    }
    else if (!foundAi) {
      const newAi = new Ia();
      newAi.userid = author.id;
      newAi.channelid = channel.id;
      newAi.active = true;
      await newAi.save();
      const currentAi = await Ia.findOne({ userid: author.id });
      reply(startedmsg);
      const collector2 = channel.createMessageCollector(filter);
      collector2.on("collect", async m => {
        if (m.author.id !== author.id) return;
        if (m.author.bot) return;
        if (m.content.toLowerCase() === 'stop ai') {
          currentAi.active = false;
          await currentAi.save();
          m.reply(stoppedmsg);
          return collector2.stop();
        }
        channel.sendTyping();
        const contenido = m.content;
        const rsp = await cleverbot.getResponse(contenido, m.author.id);
        m.reply(rsp);
      })
    }
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'setprefix')) {
    let noperms = 'No tienes permisos para usar este comando.';
    let yapre = 'No puedes establecer el mismo prefijo.';
    let faltapre = 'Debes introducir el nuevo prefijo.';
    let carac = 'El nuevo prefijo no puede tener más de 4 carácteres.';
    let done = 'Prefijo establecido con éxito.';
    if (foundL) {
      if (foundL.lang === 'en') {
        noperms = 'You don\'t have permissions to use this command.';
        yapre = 'You can\'t establish the same prefix.';
        faltapre = 'You must enter the new prefix.';
        carac = 'The new prefix cannot have more than 4 characters';
        done = 'Prefix set successfully.';
      }
      else if (foundL.lang === 'br') {
        noperms = 'Você não tem permissão para usar este comando.';
        yapre = 'Você não pode definir o mesmo prefixo.';
        faltapre = 'Você deve inserir o novo prefixo.';
        carac = 'O novo prefixo não pode ter mais de 4 caracteres.';
        done = 'Prefixo definido com sucesso.';
      }
    }
    if (!message.member.permissions.has('MANAGE_GUILD')) return reply(`<a:alertapro:869607044892741743> - ${noperms}`);
    const p = args[1];
    if (!p) return reply(`<a:alertapro:869607044892741743> - ${faltapre}`);
    if (p.toLowerCase() === prefix.toLowerCase()) return reply(`<a:alertapro:869607044892741743> - ${yapre}`);
    if (p.length > 4) return reply(`<a:alertapro:869607044892741743> - ${carac}`);
    if (!LocalPrefix) {
      const newp = new Prefixes();
      newp.guildid = message.guild.id;
      newp.prefix = p;
      await newp.save();
      try {
      await guild.me.setNickname(`[${p.toLowerCase()}] Barnie`);
      }
      catch (err) {
        console.log(err.stack);
      }
      reply(done);
    }
    else {
      LocalPrefix.prefix = p;
      await LocalPrefix.save();
      await guild.me.setNickname(`[${p.toLowerCase()}] Barnie`);
      reply(done);
    }
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'filter')) {
    const pactions = ['on', 'off', 'add', 'remove', 'whitelist', 'view'];
    const foundF = await Filter.findOne({ guildid: message.guild.id });
    let noacc = 'Debes introducir una acción de estas:\n`on`, `off`, `add`, `remove`, `whitelist`, `view`, `message`';
    let novalid = 'La acción introducida es inválida.';
    let noperms = 'No tienes permisos para usar este comando.';
    let noactive = 'El filtro se encuentra ya desactivado.';
    let yaactive = 'El filtro se encuentra ya activado.';
    let asmsg = 'El filtro ha sido activado, sin embargo, este servidor no cuenta con palabras en el filtro, ¿Desea añadir la colección por defecto?';
    let defsi = 'Vale, se ha añadido la colección por defecto, puedes añadir o remover palabras diciendo `' + prefix + 'filter add/remove`';
    let offya = 'Filtro desactivado con éxito.';
    let onya = 'Filtro activado con éxito.';
    let msgask = '¿Qué mensaje deseas establecer al detectar una palabra en el filtro?';
    let msgya = 'Mensaje establecido con éxito.';
    let defno = 'Vale, filtro activado sin la colección por defecto, deberá añadir sus propias palabras al filtro.';
    let nodb = 'Este servidor no está en mi base de datos de filtros, usa el comando `filter on` para activarlo.';
    let notarget = 'Debes introducir la palabra que quieres añadir al filtro.';
    let norm = 'Debes introducir la palabra que deseas remover del filtro.';
    let askrm = 'La palabra que deseas remover es ';
    let doneword = 'Palabra añadida con éxito al filtro.';
    let nofrm = 'No encontré ninguna palabra igual o similar.';
    let donerm = 'Palabra removida del filtro con éxito.';
    let cancelrm = 'Vale, comando cancelado.';
    let nowtype = 'Debes introducir una acción de la whitelist:\n`roleadd`, `roleremove`, `memberadd`, `memberremove`, `channeladd`, `channelremove`';
    let norole = 'Debes mencionar el rol que deseas agregar.';
    let yaenr = 'Ese rol ya está en la whitelist.';
    let yarole = 'Rol agregado con éxito a la whitelist.';
    let norolerm = 'Debes mencionar el rol que deseas remover.';
    let noenr = 'Ese rol no está en el whitelist.';
    let roleremove = 'Rol removido con éxito.';
    let importante = 'IMPORTANTE: Este token es único en el servidor, debe guardarlo para poder interactuar con la API de barnie bot al remover/añadir palabras.';
    let nomem = 'Debes mencionar al miembro que deseas añadir al whitelist.';
    let nomem2 = 'Debes mencionar al miembro que deseas remover del whitelist.';
    let yamem = 'Ese miembro ya está en el whitelist.';
    let yamem2 = 'Ese miembro no está en el whitelist.';
    let donemem = 'Miembro añadido con éxito.';
    let donemem2 = 'Miembro removido con éxito.';
    if (foundL) {
      if (foundL.lang === 'en') {
        noacc = 'You must enter one of these actions:\n`on`, `off`, `add`, `remove`, `whitelist`, `view`, `setmessage`';
        novalid = 'The entered action is invalid.';
        noperms = 'You do not have permissions to use this command.';
        noactive = 'The filter is already deactivated.';
        yaactive = 'The filter is already activated.';
        asmsg = 'The filter has been activated, however, this server does not have words in the filter, do you want to add the default collection?';
        defsi = 'Ok, the default collection has been added, you can add or remove words saying `' + prefix + 'filter add/remove`';
        msgask = 'What message do you want to set when detecting a word in the filter?';
        msgya = 'Successfully established the message.';
        defno = 'Ok, filter activated without the default collection, you must add your own words to the filter.';
        offya = 'Filter disabled successfully.';
        onya = 'Filter activated successfully.';
        nodb = 'This server is not in my filter database, use the `filter on` command to activate it.';
        notarget = 'You must enter the word you want to add to the filter.';
        norm = 'You must enter the word you want to remove from the filter.';
        doneword = 'Word successfully added to the filter.';
        askrm = 'The word you want to remove is ';
        nofrm = 'I couldn\'t find that word or a similar one.';
        cancelrm = 'Okay, command canceled.';
        donerm = 'Word removed from filter successfully.';
        nowtype = 'You must enter a whitelist action:\n`roleadd`, `roleremove`, `memberadd`, `memberremove`, `channeladd`, `channelremove`';
        norole = 'You must mention the role you want to add.';
        yaenr = 'That role is already in the whitelist.';
        yarole = 'Role successfully added to the whitelist.';
        noenr = 'That role is not in the whitelist.';
        roleremove = 'Role removed successfully.';
        importante = 'IMPORTANT: This token is unique on the server, you must save it in order to interact with the barnie bot API when removing / adding words.';
        nomem = 'You must mention the member you want to add to the whitelist.';
        nomem2 = 'You must mention the member you want to remove from the whitelist.';
        yamem = 'That member is already on the whitelist.';
        yamem2 = 'That member is not on the whitelist.';
        donemem = 'Member added successfully.';
        donemem2 = 'Member removed successfully.';
      }
      else if (foundL.lang === 'br') {
        noacc = 'Você deve inserir uma dessas ações:\n`on`, `off`, `add`, `remove`, `whitelist`, `view`, `message`';
        novalid = 'A ação inserida é inválida.';
        noperms = 'Você não tem permissão para usar este comando.';
        noactive = 'O filtro já está desativado.';
        yaactive = 'O filtro já está ativado.';
        asmsg = 'O filtro foi ativado, no entanto, este servidor não contém palavras no filtro, deseja adicionar a coleção padrão?';
        defsi = 'Ok, a coleção padrão foi adicionada, você pode adicionar ou remover palavras dizendo `' + prefix + 'filter add/remove`';
        msgask = 'Que mensagem você deseja definir ao detectar uma palavra no filtro?';
        msgya = 'Mensagem estabelecida com sucesso.';
        defno = 'Ok, filtro ativado sem a coleção padrão, você deve adicionar suas próprias palavras ao filtro.';
        offya = 'Filtro desativado com sucesso.';
        onya = 'Filtro ativado com sucesso.';
        nodb = 'Este servidor não está em meu banco de dados de filtro, use o comando `filter on` para ativá-lo.';
        notarget = 'Você deve inserir a palavra que deseja adicionar ao filtro.';
        norm = 'Você deve inserir a palavra que deseja remover do filtro.';
        doneword = 'Palavra adicionada ao filtro com sucesso.';
        askrm = 'A palavra que você deseja remover é ';
        nofrm = 'Não encontrei nenhuma palavra igual ou semelhante.';
        cancelrm = 'Ok, comando cancelado.';
        donerm = 'Palavra removida do filtro com sucesso.';
        nowtype = 'Você deve inserir uma ação de lista de permissões:\n`roleadd`, `roleremove`, `memberadd`, `memberremove`, `channeladd`, `channelremove`';
        norole = 'Você deve mencionar a função que deseja adicionar.';
        yaenr = 'Essa função já está na lista de permissões.';
        yarole = 'Função adicionada com sucesso à lista de permissões.';
        noenr = 'Essa função não está na lista de permissões.';
        roleremove = 'Função removida com sucesso.';
        importante = 'IMPORTANTE: Este token é único no servidor, você deve salvá-lo para interagir com a API do bot barnie ao remover / adicionar palavras.';
        nomem = 'Você deve mencionar o membro que deseja adicionar à lista de permissões.';
        nomem2 = 'Você deve mencionar o membro que deseja remover da lista de permissões.';
        yamem = 'Esse membro já está na lista de permissões.';
        yamem2 = 'Esse membro não está na lista de permissões.';
        donemem = 'Membro adicionado com sucesso.';
        donemem2 = 'Membro removido com sucesso.';
      }
    }
    const caction = args[1];
    if (!message.member.permissions.has('MANAGE_MESSAGES')) return reply(`<a:alertapro:869607044892741743> - ${noperms}`);
    if (!caction) return reply(`<a:alertapro:869607044892741743> - ${noacc}`);
    if (!pactions.includes(caction.toLowerCase())) return (`<a:alertapro:869607044892741743> - ${novalid}`);
    if (caction.toLowerCase() === 'off') {
      if (!foundF || foundF.active === false) { return reply(`<a:alertapro:869607044892741743> - ${noactive}`); }
      else if (foundF) {
        foundF.active = false;
        await foundF.save();
        reply(offya);
      }
    }
    else if (caction.toLowerCase() === 'on') {
      if (foundF && foundF.active === true) { return reply(`<a:alertapro:869607044892741743> - ${yaactive}`); }
      else if (!foundF) {
        const guild_token = bcrypt.genSaltSync(10);
        const askMsg = await channel.send(asmsg);
        await askMsg.react('👍');
        await askMsg.react('👎');
        const newf = new Filter();
        newf.guildid = guild.id;
        newf.words = [];
        newf.rolwhite = [];
        newf.memwhite = [];
        newf.channelwhite = [];
        newf.message = 'No links.';
        newf.active = true;
        newf.guild_token = guild_token;
        const filtir = (reaction, user) => !user.bot;
        const collector = askMsg.createReactionCollector(filtir);
        collector.on('collect', async (reaction, user) => {
          if (user.bot) return;
          if (user.id !== author.id) return reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``));
          async function getResponse(question) {
            channel.send(question);
            if (author.bot) return;
            const filtur = m => m.author.id === message.author.id;
            const collected = await channel.awaitMessages({ filter: filtur, max: 1 });
            return collected.first();
          }
          if (reaction.emoji.name === '👍') {
            askMsg.reactions.removeAll();
            askMsg.edit(defsi);
            newf.words = ["dick", "pussy"]
            const msg = await getResponse(msgask);
            newf.message = msg.content;
            author.send(importante + `\n${guild_token}`);
            await newf.save();
            msg.reply(msgya);
            collector.stop();
          }
          else if (reaction.emoji.name === '👎') {
            askMsg.reactions.removeAll();
            askMsg.edit(defno);
            const msg2 = await getResponse(msgask);
            newf.message = msg2.content;
            author.send(`${importante}\n${guild_token}`);
            await newf.save();
            msg2.reply(msgya);
            collector.stop();
          }
          else if (reaction.emoji.name !== '👎' && reaction.emoji.name !== '👍') { return reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``)); }
        });
      }
      else if (foundF) {
        foundF.active = true;
        await foundF.save();
        reply(onya);
      }
    }
    else if (caction.toLowerCase() === 'add') {
      if (!foundF) return reply(nodb);
      const target = args.slice(2).join(' ');
      if (!target) return reply(notarget);
      foundF.words.push(target);
      await foundF.save();
      reply(doneword);
    }
    else if (caction.toLowerCase() === 'remove') {
      if (!foundF) return reply(nodb);
      const target2 = args[2];
      if (!target2) return reply(norm);
      const foundw = foundF.words.find(word => word === target2 || word.toLowerCase().includes(target2.toLowerCase()));
      if (!foundw) return reply(nofrm);
      const iskmsg = await message.reply(askrm + `**${foundw}**?`);
      await iskmsg.react('👍');
      await iskmsg.react('👎');
      const filt = (reaction, user) => !user.bot;
      const collector = iskmsg.createReactionCollector(filt);
      collector.on('collect', async (reaction, user) => {
        if (user.bot) return;
        if (user.id !== author.id) return reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``));
        if (reaction.emoji.name === '👍') {
          iskmsg.reactions.removeAll();
          let indix = null;
          foundF.words.forEach(async (word, index) => {
            if (word === foundw && indix === null) return indix = index;
          });
          foundF.words.splice(indix, 1);
          await foundF.save();
          iskmsg.edit(donerm);
          collector.stop();
        }
        else if (reaction.emoji.name == '👎') {
          iskmsg.reactions.removeAll();
          iskmsg.edit(cancelrm);
          collector.stop();
        }
        else if (reaction.emoji.name !== '👎' && reaction.emoji.name !== '👍') { return reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``)); }
      });
    }
    else if (caction.toLowerCase() === 'whitelist') {
      if (!foundF) return reply(nodb);
      const wtypes = ['roleadd', 'roleremove', 'memberadd', 'memberremove', 'channeladd', 'channelremove'];
      const wtipe = args[2];
      if (!wtipe) return reply(`<a:alertapro:869607044892741743> - ${nowtype}`);
      if (!wtypes.some(type => wtipe.toLowerCase() !== type)) return reply(`<a:alertapro:869607044892741743> - ${nowtype}`);
      if (wtipe.toLowerCase() === 'roleadd') {
        const roleT = message.mentions.roles.first();
        if (!roleT) return reply(`<a:alertapro:869607044892741743> - ${norole}`);
        if (foundF.rolwhite.includes(roleT.id)) return reply(`<a:marcasi:800125816633557043> ${yaenr}`);
        foundF.rolwhite.push(roleT.id);
        await foundF.save();
        reply(yarole);
      }
      else if (wtipe.toLowerCase() === 'roleremove') {
        const rolet = message.mentions.roles.first();
        if (!rolet) return reply(`<a:alertapro:869607044892741743> - ${norolerm}`);
        if (!foundF.rolwhite.includes(rolet.id)) return reply(`<a:alertapro:869607044892741743> - ${noenr}`);
        let indix = null;
        foundF.rolwhite.forEach(async (role, index) => {
          if (role === rolet.id && indix === null) return indix = index;
        });
        foundF.rolwhite.splice(indix, 1);
        await foundF.save();
        reply(roleremove);
      }
      const targetMem = message.mentions.members.first();
      switch (wtipe.toLowerCase()) {
        case 'memberadd':
          if (!targetMem) return reply('<a:alertapro:869607044892741743> - ' + nomem);
          const foundMember = await foundF.memwhite.find(m => m === targetMem.user.id);
          if (foundMember) return reply(`<a:alertapro:869607044892741743> - ${yamem}`);
          foundF.memwhite.push(targetMem.user.id);
          await foundF.save();
          reply(donemem);
          break;
        case 'memberremove':
          if (!targetMem) return reply('<a:alertapro:869607044892741743> - ' + nomem);
          const foundMember2 = await foundF.memwhite.find(m => m === targetMem.user.id);
          if (!foundMember2) return reply(`<a:alertapro:869607044892741743> - ${yamem2}`);
          let indix = null;
          foundF.memwhite.forEach((m, index) => {
            if (m === targetMem.user.id && indix === null) indix = index;
          });
          foundF.memwhite.splice(indix, 1);
          await foundF.save();
          reply(donemem2);
          break;
      }
    }
    else if (caction.toLowerCase() === 'view') {
      const vPath = './filter_words.txt';
      const waitmsg = await message.reply(loadingdc);
      if (!foundF) reply(nodb);
      const words = foundF.words;
      fs.writeFileSync(vPath, ` ------ ${message.guild.name} ------`);
      fs.writeFileSync(vPath, `${fs.readFileSync(vPath)}\n\n${words.length > 0 ? words.map(w => w).join(', ') : '------ 0 words ------'}`);
      await waitmsg.edit({ content: `${words.length} words`, files: [vPath] });
    }
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'setupdates')) {
    let noperms = 'No tienes permisos para usar este comando.';
    let nochannel = 'Debes mencionar el canal que deseas establecer como el canal de noticias.';
    let success = 'Canal establecido con éxito.';
    if (foundL) {
      if (foundL.lang === 'en') {
        noperms = 'You do not have permissions to use this command.';
        nochannel = 'You must mention the channel you want to set as the news channel.';
        success = 'Channel successfully established.';
      }
      else if (foundL.lang === 'br') {
        noperms = 'Você não tem permissão para usar este comando.';
        nochannel = 'Você deve mencionar o canal que deseja definir como o canal de notícias.';
        success = 'Canal estabelecido com sucesso.';
      }
    }
    if (!message.member.permissions.has('MANAGE_CHANNELS')) return reply(`<a:alertapro:869607044892741743> - ${noperms}`);
    const tchannel = message.mentions.channels.first();
    if (!tchannel) return reply(`<a:alertapro:869607044892741743> - ${nochannel}`);
    const foundN = await Notice.findOne({ guildid: guild.id });
    if (!foundN) {
      const newn = new Notice();
      newn.guildid = guild.id;
      newn.channelid = tchannel.id;
      newn.active = true;
      await newn.save();
      reply(success);
    }
    else if (foundN) {
      foundN.channelid = tchannel.id;
      await foundN.save();
      reply(success);
    }
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'announce')) {
    if (author.id !== data.owner) return reply('No');
    const msg = args.slice(1).join(' ');
    if (!msg) return reply('<a:alertapro:869607044892741743> - Debes introducir el mensaje.');
    const nembed = new Discord.MessageEmbed()
      .setTitle('<:infopro:869606970557095946> - Nueva noticia')
      .setDescription(`${msg}`)
      .setFooter(`Enviada por ${author.tag}`)
      .setColor('PURPLE')
      .setTimestamp()
      .setThumbnail('https://i.pinimg.com/originals/8e/d7/ab/8ed7abd50091c49cf61d170d91418e5e.jpg');
    const nchannels = await Notice.find();
    for (const c of nchannels) {
      if (c.active === true) {
        await client.channels.cache.get(c.channelid).send({ embeds: [nembed] });
      }
    }
    reply('Noticia enviada!');
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'servers')) {
    if (author.id !== data.owner) return reply('No');
    const servers = client.guilds.cache.map(s => s);
    servers.sort((a, b) => {
      return b.memberCount - a.memberCount
    });
    const mapped = servers.map(s => `${s.name} (${s.memberCount - 1} miembros)`);
    reply(`${client.guilds.cache.size} servidores` + '```\n' + mapped.join('\n\n') + '\n```');
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'eval')) {
    if (author.id !== data.owner) return reply('no');
    const targetCode = args.slice(1).join(' ');
    if (!targetCode) return reply('Debes introducir un código a evaluar');
    try {
      const evaled = eval(targetCode);
      const embed = new Discord.MessageEmbed()
        .setColor('GREEN')
        .setTitle('Código evaluado')
        .addField('**Tipo del output**:', `\`\`\`prolog\n${typeof (evaled)}\`\`\``, true)
        .addField('**Evaluado en:**', `\`\`\`yaml\n${Date.now() - message.createdTimestamp}ms\`\`\``, true)
        .addField('**Input**', `\`\`\`js\n${targetCode}\`\`\``)
        .addField('**Output**', `\`\`\`js\n${inspect(evaled, { depth: 0 })}\`\`\``);
      reply({ embeds: [embed] });
    }
    catch (error) {
      const errorEmbed = new Discord.MessageEmbed()
        .setColor('RED')
        .setTitle('ERROR')
        .addField('Input', `\`\`\`js\n${targetCode}\`\`\``)
        .addField('Error', `\`\`\`js\n${error}\`\`\``);
      reply({ embeds: [errorEmbed] });
    }
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'userlist')) {
    if (author.id !== data.owner) return;
    const msgWait = await message.reply('<a:discordproloading:875107406462472212>');
    fs.writeFileSync('./users.txt', `--------- ${client.users.cache.size} users ---------`);
    let num = 0;
    for (const u of client.users.cache.values()) {
      if (u.bot) return;
      num = num + 1;
      fs.writeFileSync('./users.txt', fs.readFileSync('./users.txt') + `\n[${num}] ${u.tag}`);
      console.log(`[${num}] ${u.tag} listed.`);
    }
    await msgWait.delete();
    await reply({ files: ['./users.txt'] });
    setTimeout(async function () {
      fs.writeFileSync('./users.txt', '--------- Waiting for requests ---------');
    }, 4500);
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'blackadd')) {
    if (!eco) return;
    if (eco.rank < 3) return;
    let ide = args[1];
    if (!ide) return reply('¿Y la ID?');
    if (isNaN(ide)) return reply('La ID debe ser un string numérico.');
    ide = String(ide);
    await client.users.fetch(ide).catch();
    if (!client.users.cache.has(ide)) return reply('404 - ID not found');
    const foundU = await client.users.cache.get(ide);
    const already = await Black.findOne({ userid: ide });
    if (already && already.blocked === true) return reply('El usuario ya se encuentra en la blacklist.');
    if (already) {
      already.blocked = true;
      await already.save();
      reply(`Blacklisted **${foundU.tag}**`);
    }
    else {
      const newb = new Black();
      newb.userid = ide;
      newb.blocked = true;
      await newb.save();
      reply(`Blacklisted **${foundU.tag}**`);
    }
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'warn') || content.toLowerCase().startsWith(prefix.toLowerCase() + 'advertir')) {
    let nouser = 'Debe mencionar al usuario al que deseas darle la advertencia.';
    let yauser = 'Usuario advertido con éxito.';
    let askmute = 'El usuario cuenta con 3 o más advertencias, ¿Desea silenciarlo?';
    let nomute = 'Vale, no le he silenciado.';
    let simute = 'Usuario silenciado.';
    let noperms = 'No tienes permisos para usar este comando.';
    if (foundL) {
      switch (foundL.lang) {
        case 'en':
          nouser = 'You must mention the user you want to give the warning to.';
          yauser = 'User successfully warned.';
          askmute = 'The user has 3 or more warnings, do you want to mute them?';
          nomute = 'Okay, I haven\'t muted them.';
          simute = 'Muted user.';
          noperms = 'You do not have permissions to use this command.';
          break;
        case 'br':
          nouser = 'Você deve mencionar o usuário a quem deseja dar o aviso.';
          yauser = 'Usuário avisado com sucesso.';
          askmute = 'O usuário tem 3 ou mais avisos, deseja silenciá-lo?';
          nomute = 'Ok, eu não o silenciei.';
          simute = 'Usuário silenciado.';
          moperms = 'Você não tem permissão para usar este comando.';
          break;
      }
    }
    if (!message.member.permissions.has('MANAGE_MESSAGES')) return reply(`<a:alertapro:869607044892741743> - ${noperms}`);
    const targetU = message.mentions.users.first();
    let reason = args.slice(2).join(' ');
    if (!targetU) return reply(`<a:alertapro:869607044892741743> - ${nouser}`);
    if (targetU.bot) return reply('no');
    if (targetU.id === message.author.id) return reply('no');
    const foundW = await Warn.findOne({ guildid: guild.id, userid: targetU.id });
    if (!reason) reason = 'none';
    const foundel = await Lang.findOne({ userid: targetU.id });
    let mod = 'Moderador / Administrador';
    let reas = 'Motivo';
    let msg = 'Has sido advertido';
    if (foundel) {
      switch (foundel.lang) {
        case 'en':
          mod = 'Moderator / Administrator';
          msg = 'You have been warned';
          reas = 'Reason';
          break;
        case 'br':
          mod = 'Moderador / Administrador';
          reas = 'Razão';
          msg = 'Você foi avisado';
          break;
      }
    }
    const warnEmbed = new Discord.MessageEmbed()
      .setTitle(`<a:alertapro:869607044892741743> - ${msg}`)
      .addField(mod, author.tag)
      .addField(reas, reason)
      .setColor('RED')
      .setTimestamp();
    if (!foundW) {
      const neww = new Warn();
      neww.guildid = guild.id;
      neww.userid = targetU.id;
      neww.warns = [{
        responsible: author.tag,
        reason: reason,
      }];
      await neww.save();
      reply(yauser);
      targetU.send({ embeds: [warnEmbed] }).catch(error => reply(`An error ocurred:\n\`${error}\``));
    }
    else if (foundW.warns.length === 3 || foundW.warns.length > 3) {
      foundW.warns.push({ responsible: author.tag, reason: reason });
      await foundW.save();
      targetU.send({ embeds: [warnEmbed] }).catch(error => reply(`An error ocurred:\n\`${error}\``));
      const askMsg = await message.reply(askmute);
      await askMsg.react('👍');
      await askMsg.react('👎');
      const filtir = (reaction, user) => !user.bot;
      const collector = askMsg.createReactionCollector({ filter: filtir });
      collector.on('collect', async (reaction, user) => {
        if (user.bot) return;
        if (user.id !== author.id) return reaction.users.remove(user.id).catch(err => console.log(`Error while deleting a reaction\n\`${err}\``));
        if (reaction.emoji.name === '👍') {
          askMsg.reactions.removeAll();
          const findRole = guild.roles.cache.find(r => r.name === 'muted');
          if (!findRole) {
            askMsg.edit('<a:discordproloading:875107406462472212>');
            const newRole = await guild.roles.create({ name: 'muted', color: 'PURPLE' });
            guild.members.cache.get(targetU.id).roles.add(newRole);
            guild.channels.cache.forEach(async c => {
              const ch = await guild.channels.fetch(c.id);
              console.log(`Denied ${ch.name}`);
              ch.permissionOverwrites.create(newRole.id, { SEND_MESSAGES: false });
            });
          }
          else {
            guild.members.fetch(targetU.id).then(u => {
              u.roles.add(findRole);
            });
          }
          askMsg.edit(simute);
          collector.stop();
        }
        else if (reaction.emoji.name === '👎') {
          askMsg.reactions.removeAll();
          askMsg.edit(nomute);
          collector.stop();
        }
      });
    }
    else {
      foundW.warns.push({ responsible: author.tag, reason: reason });
      await foundW.save();
      reply(yauser);
      targetU.send({ embeds: [warnEmbed] }).catch(error => reply(`An error ocurred:\n\`${error}\``));
    }
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'viewwarns')) {
    let nouser = 'Debes mencionar al usuario cuyas advertencias deseas ver.';
    let mod = 'Moderador / Administrador';
    let reas = 'Motivo';
    let adv = 'Advertencias';
    if (foundL) {
      switch (foundL.lang) {
        case 'en':
          nouser = 'You must mention the user whose warnings you want to see.';
          mod = 'Moderator / Administrator';
          reas = 'Reason';
          adv = 'Warnings';
          break;
        case 'br':
          nouser = 'Você deve mencionar o usuário cujos avisos deseja ver.';
          mod = 'Moderador / Administrador';
          reas = 'Razão';
          adv = 'Avisos';
          break;
      }
      const targetu = message.mentions.users.first();
      if (!targetu) return await reply(`<a:alertapro:869607044892741743> - ${nouser}`);
      const foundW = await Warn.findOne({ guildid: guild.id, userid: targetu.id });
      const embed = new Discord.MessageEmbed()
        .setTitle(`${adv} - ${targetu.username}`)
        .setColor('YELLOW')
        .setTimestamp();
      if (!foundW) {
        const neww = new Warn();
        neww.guildid = guild.id;
        neww.userid = targetu.id;
        neww.warns = [];
        embed.setDescription('none');
        reply({ embeds: [embed] });
        await neww.save();
      }
      else if (foundW.warns.length < 1) {
        embed.setDescription('none');
        reply({ embeds: [embed] });
      }
      else {
        embed.setDescription(foundW.warns.map(w => `**${mod}**: ${w.responsible}\n**${reas}**: ${w.reason}\n---------`).join('\n'));
        reply({ embeds: [embed] });
      }
    }
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'genpass')) {
    author.send(genString(29));
  }
  if (content.toLowerCase().startsWith(prefix.toLowerCase() + 'reload')) {
    if (author.id !== data.owner) return;
    const waitmsg = await reply('Reloading command handler...');
    const cmFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
    commands = null;
    commands = new Discord.Collection();
    for (const file of cmFiles) {
      try {
        const cmd = require(`./commands/${file}`);
        commands.set(cmd.name, cmd);
        console.log(`[!] Reloaded ${file}`);
      }
      catch (error) {
        console.log(`[!] Error while reloading command file ${file}\n${error}`);
      }
    }
    waitmsg.edit('Command handler reloaded.');
  }
  if (!content.toLowerCase().startsWith(prefix.toLowerCase())) return;
  const cmd = args.shift().toLowerCase();
  const foundCmd = commands.get(cmd) ?? commands.find(c => {
    if (c.aliases) {
      if (c.aliases.includes(cmd)) return true;
      else return false;
    }
    else return false;
  });
  if (!foundCmd) return;
  try {
    const lng = foundL ? foundL : null;
    const Patreon = require('./models/patreons');
    const foundP = await Patreon.findOne({ userid: author.id });
    let nobeta = 'Este comando aún no ha sido lanzado oficialmente por lo que requieres ser Barniasta Tier I para usarlo.';
    let novip = 'Este comando es exclusivo para aquellos que son Barniasta Tier II';
    if (lng !== null) {
      switch (lng.lang) {
        case 'en':
          nobeta = 'This command has not yet been officially released so you need to be Barniasta Tier I in order to use it.';
          novip = 'This command is exclusive for those who are Barniasta Tier II.';
          break;
        case 'br':
          nobeta = 'Este comando ainda não foi oficialmente libertado, pelo que é necessário ser um Barniasta Tier I para o utilizar.';
          novip = 'Este comando é exclusivo para aqueles que são Barniasta Tier II.';
          break;
      }
    }
    if (foundCmd.tier && foundCmd.tier === 1 && !foundP || foundP && foundP.tier < foundCmd.tier) return reply(nobeta);
    if (foundCmd.tier && foundCmd.tier === 2 && !foundP || foundP && foundP.tier < foundCmd.tier) return reply(novip);
    const foundEmployee = await Employee.findOne({ discordID: message.author.id });
    if (foundCmd.clynet) {
      if (foundCmd.clynet.requiredRank) {
        if (!foundEmployee || foundEmployee && foundEmployee.rankLevel < foundCmd.clynet.requiredRank) return reply("You're not authorized to use this command.");
      }
    }
    async function getInput() {
      const filter = m => m.author.id === message.author.id;
      const collected = await message.channel.awaitMessages({ filter: filter, max: 1 });
      return collected.first();
    }
    await foundCmd.execute(message, args, lng, getInput);
  }
  catch (err) {
    message.reply('An unexpected error ocurred.');
    console.log(`Error while executing command '${foundCmd.name}'\n${err.stack}`);
  }
});
client.on('messageCreate', async message => {
  if (!message.guild) return;
  let prefix;
  const LocalPrefix = await Prefixes.findOne({ guildid: message.guild.id });
  if (LocalPrefix) {
    prefix = LocalPrefix.prefix;
  }
  else {
    prefix = data.prefix;
  }
  client.prefix = prefix;
  const guild = message.guild;
  const author = message.author;
  const channel = message.channel;
  const content = message.content;
  const foundf = await Filter.findOne({ guildid: guild.id });
  if (foundf && foundf.active === true && !content.toLowerCase().startsWith(prefix.toLowerCase() + 'filter')) {
    if (author.id === client.user.id || author.bot) return;
    let fbiolean = false;
    const wordArray = [];
    foundf.words.forEach(word => {
      if (content.toLowerCase().includes(word.toLowerCase())) {
        fbiolean = true;
        wordArray.push(word);
      }
    });
    if (fbiolean === true) {
      let biolean = false;
      foundf.rolwhite.forEach(role => {
        if (message.member.roles.cache.has(role) && biolean === false) return biolean = true;
      });
      if (foundf.channelwhite.includes(channel.id)) return;
      if (foundf.memwhite.includes(author.id)) return;
      if (biolean === true) return;
      if (message.deletable) {
        let misg = content;
        const censoreds = ['*', '**', '***', '****', '*****', '******', '*******', '********', '*********', '**********', '***********', '************', '*************', '**************', '***************', '****************', '*****************', '******************', '*******************', '********************', '*********************', '**********************', '***********************', '************************', '*************************', '**************************', '***************************'];
        await wordArray.forEach(word => {
          const reg = new RegExp(word, 'ig');
          misg = misg.replace(reg, `\`${censoreds[word.length - 1]}\``);
        });
        await message.delete();
        const webhook = await channel.createWebhook('filter', {
          avatar: 'https://xerobot.xyz/images/default_avatar.png',
        });
        await channel.send(`<@${author.id}>, ${foundf.message}`);
        await webhook.send({
          content: misg,
          username: message.member.nickname ? message.member.nickname : author.username,
          avatarURL: author.displayAvatarURL({ dynamic: true }),
        });
        await webhook.delete();
      }
      else {
        channel.send('`ERROR`\nEspañol: No tengo permisos para borrar mensajes, no puedo borrar mensajes prohíbidos.\n\nEnglish: I do not have permissions to delete messages, I cannot delete prohibited messages.\n\nPortuguês: Não tenho permissão para deletar mensagens, não consigo deletar mensagens proibidas.');
      }
    }
  }
});
client.on('messageCreate', async message => {
  if (!message.guild) return;
  async function reply(content) {
    return await message.reply(content).catch(err => message.channel.send9`Error while replying\n\`${err}\``);
  }
  let prefix;
  const LocalPrefix = await Prefixes.findOne({ guildid: message.guild.id });
  if (LocalPrefix) {
    prefix = LocalPrefix.prefix;
  }
  else {
    prefix = data.prefix;
  }
  const args = message.content.slice(prefix.length).trim().split();
  if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) return;
  const command = args.shift().toLowerCase();
  const foundCmd = await Cmd.findOne({ guildid: message.guild.id, triggerer: command });
  if (foundCmd) {
    const rsp = foundCmd.response.replace('{user:username}', `${message.author.username}`).replace('{guild:membercount}', `${message.guild.memberCount}`).replace('{user:mention}', `<@${message.author.id}>`).replace('{user:tag}', `${message.author.tag}`).replace('{user:avatar}', `${message.author.displayAvatarURL({ dynamic: true })}`).replace('{guild:icon}', `${message.guild.iconURL({ dynamic: true }) !== null ? message.guild.iconURL({ dynamic: true }) : 'no icon'}`).replace('${process.env.TOKEN}', '[tried to view token]');
    reply(`${rsp}`);
  }
});
client.on('messageCreate', async message => {
  if (!message.guild) return;
  const foundC = await Chat.findOne({ guildid: message.guild.id, active: true, channelid: message.channel.id });
  if (!foundC) return;
  const m = message;
  const chats = await Chat.find();
  if (m.webhookId) return;
  const foundB = await Black.findOne({ userid: m.author.id });
  if (m.author.bot || foundB && foundB.blocked === true) {
    if (!m.channel.permissionsFor(client.user.id).has('MANAGE_MESSAGES')) return;
    await m.react('❌').catch(console.log);
    const reactFilter = (reaction, user) => !user.bot;
    const collectr = m.createReactionCollector({ filter: reactFilter });
    const mid = m.id;
    const mch = m.channel;
    const reacTime = setTimeout(async function () {
      try {
        const msg = await mch.messages.fetch(mid);
        if (msg.deleted || !msg) return;
        collectr.stop();
        m.reactions.removeAll().catch(console.log);
      }
      catch (err) {
        console.log(err);
      }
    }, 10000);
    collectr.on('collect', async (reaction, user) => {
      if (reaction.emoji.name === '❌') {
        await collectr.stop();
        await m.delete().catch(err => m.channel.send(`Error while deleting bot / banned message\n\`${err}\``));
        clearTimeout(reacTime);
      }
    });
    return;
  }
  let content = m.content;
  const founu = await Lang.findOne({ userid: m.author.id });
  if (content.toLowerCase().includes('https://discord.gg') || content.toLowerCase().includes('discord.gg')) {
    let prdc = 'Tu mensaje contiene un link de invitación por lo que no se ha envíado en el chat global.';
    if (founu) {
      if (founu.lang === 'en') {
        prdc = 'Your message contains an invitation link so it has not been sent in the global chat.';
      }
      else if (founu.lang === 'br') {
        prdc = 'Sua mensagem contém um link de convite para que não tenha sido enviada no bate-papo global.';
      }
    }
    return m.author.send(prdc);
  }
  if (content.includes('@everyone') || content.includes('@here')) {
    let prev = 'Tu mensaje incluye `@everyone` o `@here` así que para evitar molestar a otros servidores, tu mensaje no se ha enviado.';
    if (founu) {
      if (founu.lang === 'en') {
        prev = 'Your message includes `@everyone` or `@here` so to avoid disturbing other servers, your message has not been sent.';
      }
      else if (founu.lang === 'br') {
        prev = 'Sua mensagem inclui `@everyone` ou `@here`, portanto, para não perturbar outros servidores, sua mensagem não foi enviada.';
      }
    }
    return m.author.send(prev);
  }
  chats.forEach(async g2 => {
    try {
      if (g2.active === true && client.channels.cache.has(g2.channelid)) {
        const chin = client.channels.cache.get(g2.channelid);
        if (chin.id === m.channel.id) return;
        const badwords = [];
        badwords.push('pene', 'p3ne', 'pen3', 'p3n3', 'vagina', 'v4gina', 'vagin4', 'v4gin4', 'https://t.me/joinchat/', '@everyone', '@here', '<@889871287453888532>', '<!@889871287453888532>');
        const censoreds = ['*', '**', '***', '****', '*****', '******', '*******', '********', '*********', '**********', '***********', '************', '*************', '**************', '***************', '****************', '*****************', '******************', '*******************', '********************', '*********************', '**********************', '***********************', '************************', '*************************', '**************************', '***************************'];
        badwords.push('puto', 'put0', 'pvto', 'pvt0', 'pto', 'pt0');
        let num = 0;
        const webh = new Discord.WebhookClient({ id: g2.webhookId, token: g2.webhookToken });
        try {
          let content2 = content;
          if (m.reference) {
            const referenceGuild = await client.guilds.fetch(m.reference.guildId);
            const referenceChannel = referenceGuild.channels.cache.get(m.reference.channelId);
            const referenceMessage = await referenceChannel.messages.fetch(m.reference.messageId);
            content2 = `> ${referenceMessage.content && referenceMessage.attachments ? referenceMessage.content.replace('> >', '>').replace(`<@${data.owner}>`, '[mention owner]').replace(`<@!${data.owner}>`, '[mention owner]') : '*Attachment*'}\n\`@${referenceMessage.author.username}\` ${m.content}`;
          }
          for (const word of badwords) {
            const regW = new RegExp(word, 'ig');
            content = content.replaceAll(regW, `\`${censoreds[word.length - 1]}\``);
            content2 = content2.replaceAll(regW, `\`${censoreds[word.length - 1]}\``);
            num = num + 1;
          }
          let username = m.author.username;
          const eco = await Economy.findOne({ userid: m.author.id });
          if (eco && eco.rank !== 1) {
            if (eco.rank === 2) {
              username = `[VIP] ${m.author.username}`;
            }
            else if (eco.rank === 3) {
              username = `[MOD] ${m.author.username}`;
            }
            else if (eco.rank === 4) {
              username = `[ADM] ${m.author.username}`;
            }
            else if (eco.rank > 4) {
              username = `[DEV] ${m.author.username}`;
            }
          }
          else {
            username = username.replaceAll('[MOD]', '').replaceAll('[VIP]', '').replaceAll('[ADM]', '').replaceAll('[ADMIN]', '').replaceAll('[DEV]', '');
          }
          await webh.send({
            content: m.content ? content2 : '*Attachment*',
            username: username,
            files: m.attachments ? m.attachments : null,
            avatarURL: m.author.displayAvatarURL({ dynamic: true }),
          }).catch(async err => {
            if (err.message.toLowerCase().includes('unknown webhook')) {
              const webh2 = await chin.createWebhook('Chat', {
                avatar: 'https://xerobot.xyz/images/default_avatar.png',
              });
              g2.webhookId = webh2.id;
              g2.webhookToken = webh2.token;
              await g2.save();
              await webh2.send({
                content: m.content ? content2 : '*Attachment*',
                username: m.author.username,
                files: m.attachments ? m.attachments : null,
                avatarURL: m.author.displayAvatarURL({ dynamic: true }),
              }).catch(err => console.log(err));
            }
          });
        }
        catch (err) {
          console.log(err);
        }
      }
    }
    catch (err) {
      console.log(`There was an error while sending the message\n\`${err}\``);
    }
  });
});
client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (!oldMessage.guild) return;
  if (oldMessage.author.bot) return;
  if (oldMessage.content === newMessage.content) return;
  const data = {
    title: {
      es: "Mensaje editado",
      en: "Edited message",
      br: "Mensagem editada"
    },
    oldContentTitle: {
      es: "Mensaje original",
      en: "Original message",
      br: "Mensagem original"
    },
    newContentTitle: {
      es: "Nuevo mensaje",
      en: "New message",
      br: "Nova mensagem"
    }
  }
  const foundC = await Log.findOne({ guildid: oldMessage.guild.id });
  if (!foundC) return;
  let channelMessage = `Mensaje de <@${oldMessage.author.id}> editado en <#${oldMessage.channel.id}>`;
  switch (foundC.lang) {
    case "en": {
      channelMessage = `Message from <@${oldMessage.author.id}> edited in <#${oldMessage.channel.id}>`;
      break;
    }
    case "br": {
      channelMessage = `Mensagem de <@${oldMessage.author.id}> editada em <#${oldMessage.channel.id}>`;
    }
  }
  const embed = new Discord.MessageEmbed()
  .setAuthor({ iconURL: oldMessage.author.displayAvatarURL({ dynamic: true }), name: oldMessage.author.tag })
  .setTitle(data.title[foundC.lang])
  .setDescription(`${channelMessage} - [link](${oldMessage.url})`)
  .addFields(
    {
      name: data.oldContentTitle[foundC.lang],
      value: oldMessage.content
    },
    {
      name: data.newContentTitle[foundC.lang],
      value: newMessage.content
    }
  )
  .setColor("PURPLE")
  .setFooter({ text: `Message ID: ${oldMessage.id} || Author ID: ${oldMessage.author.id}` })
  .setTimestamp()
  if (!client.channels.cache.has(foundC.channelid)) return;
  const ch = client.channels.cache.get(foundC.channelid);
  if (ch.id === oldMessage.channel.id) return;
  await ch.send({ embeds: [embed] });
});
client.on("messageDelete", async message => {
  if (!message.guild) return;
  const foundG = await Log.findOne({ guildid: message.guild.id });
  if (!foundG) return;
  if (message.channel.id === foundG.channelid || message.author.bot) return;
  const data = {
    title: {
      es: "Mensaje eliminado",
      en: "Message deleted",
      br: "Mensagem eliminada"
    },
    description: {
      es: `Mensaje de <@${message.author.id}> eliminado en <#${message.channel.id}>`,
      en: `Message from <@${message.author.id}> deleted in <#${message.channel.id}>`,
      br: `Mensagem de <@${message.author.id}> eliminada em <#${message.channel.id}>`
    },
    contentTitle: {
      es: "Mensaje",
      en: "Message",
      br: "Mensagem"
    }
  }
  const embed = new Discord.MessageEmbed()
  .setTitle(data.title[foundG.lang])
  .setDescription(data.description[foundG.lang])
  .addField(data.contentTitle[foundG.lang], message.content)
  .setColor("PURPLE")
  .setTimestamp()
  if (!client.channels.cache.has(foundG.channelid)) return;
  const ch = client.channels.cache.get(foundG.channelid);
  if (ch.id === message.channel.id) return;
  await ch.send({ embeds: [embed] });
});
client.login(process.env.TOKEN);
module.exports = client;