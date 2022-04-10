const RandomHub = require('random-hub').RandomHub;
const hub = new RandomHub();
module.exports = {
  name: "porn",
  aliases: ["porno", "nopor", "nsfw"],
  desription: null,
  tier: 0,
  execute: async function(message, args) {
    if (!message.channel.nsfw) return message.react(message.client.cemojis.no.emoji);
    const waitmsg = await message.reply(message.client.cemojis.loading.emoji);
    const randomGif = await hub.getRandomHub();
    await waitmsg.edit(randomGif);
  }
}
