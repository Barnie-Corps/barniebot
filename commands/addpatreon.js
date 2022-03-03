const data = require('../data.json');
const Patreon = require('../models/patreons');
module.exports = {
  name: 'addpatreon',
  description: "Adds a new patreon",
  aliases: ["patreonadd", "padd"],
  tier: 0,
  execute: async function(message, args, lang, genString) {
   if (message.author.id !== data.owner) return;
   const target = message.mentions.users.first() ? message.mentions.users.first().id : args[0];
   if (!target) return;
   if (isNaN(target)) return;
   const us = await message.client.users.fetch(target).catch(console.log);
   let tier = args[1];
   if (!tier) return;
   if (isNaN(tier)) return;
   tier = Number(tier);
   const foundP = await Patreon.findOne({ userid: target });
   if (foundP) {
     if (tier === 0) {
       await foundP.delete();
       return message.reply(`User successfully deleted from patreons`);
     }
     if (tier > 2) tier = 2;
     foundP.tier = tier;
     await foundP.save();
     message.reply(`Successfully updated **${us.tag}**`);
   } else {
     if (tier === 0) return message.reply(`Command cancelled\nReason: tier has been set as 0`);
     if (tier > 2) tier = 2;
     const newp = new Patreon();
     newp.userid = target;
     newp.tier = tier;
     await newp.save();
     message.reply(`Successfully registered **${us.tag}** as patreon with tier ${tier === 1 ? "I" : "II"}`);
   }
  }
}