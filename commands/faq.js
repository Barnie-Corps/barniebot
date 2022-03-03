const { MessageEmbed } = require('discord.js');
module.exports = {
  name: 'faqs',
  description: 'faqs',
  aliases: [],
  execute: async function(message, args, lang) {
    let q1 = '¿Qué es barnie?';
    let a1 = 'Barnie es bot un multipropósito diseñado para tener comandos intuitivos y fáciles de entender que cumplan su función impecablemente';
    let q2 = '¿Por qué elegir a barnie?';
    let a2 = 'Barnie es un bot que está en constante desarrollo y que cumplirá lo que promete, te aseguramos que no te arrepentirás de añadirlo a tu servidor aunque su IA sea muy troll';
    let q3 = '¿Es normal que se apague algunas veces?';
    let a3 = 'Sí, el bot está en fase beta y pueden surgir errores que lo crasheen, se irán implementando parches.';
    let q4 = '¿Por qué la IA a veces dice too many requests?';
    let a4 = 'Cuando la API recibe muchos mensajes bloquea temporalmente al bot, es mejor uno a la vez y sin hacerle spam.';
    if (lang !== null) {
      switch(lang.lang) {
        case "en":
        q1 = 'What\'s barnie?';
        a1 = 'Barnie is a multipurpose bot designed to have intuitive and easy to understand commands that perform its function flawlessly.';
        q2 = 'Why choose barnie?';
        a2 = 'Barnie is a bot that is in constant development and will deliver what it promises, we assure you that you will not regret adding it to your server even if its AI is very trollish.';
        q3 = 'Is it normal for it to shut down sometimes?';
        a3 = 'Yes, the bot is in beta phase and bugs may arise that may crash it, patches will be implemented.';
        q4 = 'Why does the AI sometimes say too many requests?';
        a4 = 'When the API receives many messages it temporarily blocks the bot, it is better one at a time and without spamming it.';
        break;
        case "br":
        q1 = 'O que é Barnie?';
        a1 = 'O Barnie é um bot multiuso projetado para ter comandos intuitivos e fáceis de entender que desempenham sua função sem falhas.';
        q2 = 'Por que escolher a Barnie?';
        a2 = 'Barnie é um bot que está em constante desenvolvimento e entregará o que promete, asseguramos que você não se arrependerá de adicioná-lo ao seu servidor mesmo que sua IA seja muito troll.';
        q3 = 'É normal que às vezes feche?';
        a3 = 'Sim, o bot está em fase beta e podem ocorrer bugs que podem quebrar o bot, os remendos serão implementados.';
        q4 = 'Por que a IA às vezes diz too many requests?';
        a4 = 'Quando a API recebe muitas mensagens, ela bloqueia temporariamente o bot, é melhor uma de cada vez e sem spam.';
        break;
      }
    }
    const fembed = new MessageEmbed()
    .setTitle('FAQs')
    .addField(q1, a1)
    .addField(q2, a2)
    .addField(q3, a3)
    .addField(q4, a4)
    .setColor("PURPLE")
    .setTimestamp()
    message.reply({ embeds: [fembed] }).catch(err => message.channel.send(`Error while replying\n\`${err}\``));
  }
}