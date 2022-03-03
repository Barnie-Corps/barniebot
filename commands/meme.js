const { getMeme } = require('memes-js');
module.exports = {
	name: 'meme',
	description: 'Gets a meme',
	aliases: ['memes', 'getmeme'],
	execute: async function(message, args, lang) {
		const filtersRandom = ['maau', 'memes', 'funny'];
		const filter = args[0] ? args[0].toString() : filtersRandom[Math.floor(Math.random() * filtersRandom.length)];
		const meme = await getMeme(filter);
		const { MessageEmbed } = require('discord.js');
		const embed = new MessageEmbed()
			.setDescription(`[${meme.title}](${meme.url})`)
			.setImage(meme.url)
			.setColor('PURPLE')
			.setFooter(`By ${meme.author}  ${message.client.cemojis.thumbup} ${meme.ups} ${message.client.cemojis.thumbdown} ${meme.downs}`);
		await message.reply({ embeds: [embed] }).catch(console.log);
	},
};