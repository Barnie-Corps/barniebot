module.exports = {
  name: 'fetchall',
  description: 'fetch all users',
  aliases: ['cacheall', 'getusers'],
  execute: async function(message, args, lang) {
    if (message.author.id !== '710853683520340117' && message.author.id !== "889871287453888532") return;
    await message.client.guilds.cache.forEach(async g => {
      await g.members.fetch();
      console.log(`[!] Fetched members at '${g.name}'`);
    });
    message.reply('Done');
  }
}