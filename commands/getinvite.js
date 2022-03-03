const data = require('../data.json');
module.exports = {
  name: 'getinvite',
  description: '.',
  aliases: [],
  tier: 2,
  execute: async function(message, args, lang) {
    const { client } = message;
		const nombre = args.slice(0).join(' ');
		if (!nombre) return message.reply("```\n{prefix}getinvite {guild_name}\n                      ^^^^\n\nERR: Missing Argument 'guild_name'\n```")
		const server = client.guilds.cache.find(g => g.name === nombre || g.name.includes(nombre));
		if (!server) return message.reply('I couldn\'t find that guild');
		let canal = '.';
		await server.channels.cache.forEach(async channel => {
			if (channel.type === 'GUILD_TEXT' && canal === '.') {
        const cn = await client.channels.fetch(channel.id);
			  return canal = cn;
			}
		});
		const invite = await canal.createInvite({ maxAge: 0 });
		message.reply(`discord.gg/${invite.code}`);
  }
}