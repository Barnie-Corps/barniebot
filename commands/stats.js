const User = require('../models/users');
const { MessageEmbed } = require('discord.js');
const Msg = require('../models/messages');
const os = require("os");
const moment = require('moment');
const formatMemoryUsage = (data) => `${Math.round(data / 1024 / 1024 * 100) / 100}`;
require('moment-duration-format');
module.exports = {
	name: 'stats',
	description: 'Shows bot\'s stats',
	aliases: ['botinfo', 'info', 'infobot', 'about'],
	execute: async function(message, args, lang) {
		let dbmsg = 'Base de datos';
		let servermsg = 'Servidores';
		let db_mensajes = 'Mensajes';
		let dbusers = 'Usuarios';
		let devmsg = 'Desarrollador';
		let cachedu = 'Usuarios en la caché';
		const webPage = 'https://www.barniebot.xyz/home';
		let ram = 'RAM en uso';
		let upt = 'Tiempo de actividad';
		let totalu = 'Usuarios totales';
		let noal = 'Los mensajes son contados, no almacenados, mantenemos tu privacidad!';
		if (lang !== null) {
			switch (lang.lang) {
			case 'en':
				dbmsg = 'Database';
				servermsg = 'Guilds';
				db_mensajes = 'Messages';
				dbusers = 'Users';
				devmsg = 'Developer';
				cachedu = 'Cached users';
				ram = 'RAM in use';
				upt = 'Uptime';
				totalu = 'Total users';
				noal = 'Messages are counted, not stored, we keep your privacy!';
				break;
			case 'br':
				dbmsg = 'Base de dados';
				servermsg = 'Servidores';
				db_mensajes = 'Mensagens';
				dbusers = 'Usuários';
				devmsg = 'Desenvolvedor';
				cachedu = 'Usuários no cache';
				ram = 'RAM em uso';
				upt = 'Tempo de atividade';
				totalu = 'Usuários totais';
				noal = 'As mensagens são contadas, não armazenadas, nós mantemos sua privacidade!';
				break;
			}
		}
		const loadingdc = message.client.cemojis.loading.emoji;
		const loadEmbed = new MessageEmbed()
			.setTitle('Stats')
			.addField('General', `${devmsg}: **Santiago.#9521**\n\n${servermsg}: **${message.client.guilds.cache.size}**\n\n${cachedu}: **${message.client.users.cache.size}**\n\n${totalu}: ${loadingdc}\n\n${upt}: ${loadingdc}\n\n${ram}: **${formatMemoryUsage(process.memoryUsage().heapUsed)} MB / ${formatMemoryUsage(os.totalmem())} MB**`, true)
			.addField(dbmsg, `\n${dbusers}: ${loadingdc}\n\n${db_mensajes}: ${loadingdc}\n`, true)
			.addField('Links', `\n- [Invite](https://discord.com/oauth2/authorize?client_id=900723711840251924&scope=bot%20applications.commands&permissions=8)\n`)
			.setColor('PURPLE')
			.setFooter(noal);
		const waitmsg = await message.reply({ embeds: [loadEmbed] });
		const msgs = await Msg.find();
		const users = await User.find();
		let coumt = 0;
		for (const g of message.client.guilds.cache.values()) {
			coumt += g.memberCount;
		}
		const actividad = moment.duration(message.client.uptime).format(' D [days], H [hrs], m [mins], s [secs]');
		const statEmbed = new MessageEmbed()
			.setTitle('Stats')
			.addField('General', `${devmsg}: **Santiago.#9521**\n\n${servermsg}: **${message.client.guilds.cache.size}**\n\n${cachedu}: **${message.client.users.cache.size}**\n\n${totalu}: **${coumt}**\n\n${upt}: **${actividad}**\n\n${ram}: **${formatMemoryUsage(process.memoryUsage().heapUsed)} MB / ${formatMemoryUsage(os.totalmem())} MB**`, true)
			.addField(dbmsg, `\n${dbusers}: **${users.length}**\n\n${db_mensajes}: **${msgs[0].count}**\n`, true)
			.addField('Links', `\n- [Invite](https://discord.com/oauth2/authorize?client_id=900723711840251924&scope=bot%20applications.commands&permissions=8)\n`)
			.setColor('PURPLE')
			.setFooter(noal);
		waitmsg.edit({ embeds: [statEmbed] });
	},
};