const Ticket = require('../models/stickets');
const Discord = require('discord.js');
const wait = require('util').promisify(setTimeout);
module.exports = {
	name: 'support',
	description: null,
	aliases: ['ticket', 'sticket'],
	execute: async function (message, args, lang) {
		async function reply(content) {
			return await message.reply(content).catch(err => message.channel.send(`An error ocurred while trying to reply\n\`${err}\``));
		}
		function genToken(length) {
			let char = '';
			const chars = `aAbBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQrRsStTuUvVwWxXyYzZ`;
			for (let i = 0; i < length; i++) {
				char += chars.charAt(Math.floor(Math.random() * chars.length));
			}
			return char;
		}
		const client = message.client;
		const cloading = message.client.cemojis.loading;
		let placeholder1 = 'Selecciona una opción...';
		let optionp1 = 'Reporte o denuncia';
		let optionp2 = 'Duda';
		let askmsg = 'Seleccione el tipo de soporte que desee abrir.';
		let askcmd = 'Confirme el uso del comando.';
		let cf = 'Confirmar';
		let cl = 'Cancelar';
		let cl2 = 'Comando cancelado';
		let askrs = "Por favor envía la razón de este ticket";
		let notu = "Tú no eres quien usó el comando.";
		let redi = "Ticket de soporte enviado con éxito.";
		if (lang !== null) {
			switch (lang.lang) {
				case 'en':
					placeholder1 = 'Select an option...';
					optionp1 = 'Report or denounce';
					optionp2 = 'Questions';
					askmsg = 'Select the type of ticket you want to open.';
					askcmd = 'Confirm the use of the command';
					cf = 'Confirm';
					cl = 'Cancel';
					cl2 = 'Command cancelled';
					askrs = "Please submit the reason for this support ticket";
					notu = "You are not the one who used the command.";
					redi = "Support ticket successfully submitted.";
					break;
				case 'br':
					placeholder1 = 'Selecione uma opção...';
					optionp1 = 'Relatório ou reclamação';
					optionp2 = 'Dúvida';
					askmsg = 'Selecione o tipo de ticket de suporte que você deseja abrir.';
					askcmd = 'Confirme o uso do comando.';
					cf = 'Confirmar';
					cl = 'Cancelar';
					cl2 = 'Comando cancelado';
					askrs = "Por favor, apresente o motivo para este ticket de suporte";
					notu = "Não foi você quem usou o comando.";
					redi = "Suporte ticket enviado com sucesso";
					break;
			}
		}
		let waitmsg = await reply(cloading.emoji);
		const tickets = await Ticket.find();
		const row1 = new Discord.MessageActionRow()
			.addComponents(
				new Discord.MessageSelectMenu()
					.setCustomId('support_type')
					.setPlaceholder(placeholder1)
					.addOptions([
						{
							label: optionp1,
							description: '.',
							value: 'type_report',
						},
						{
							label: optionp2,
							description: '.',
							value: 'type_q',
						},
					]),
			);
		const row2 = new Discord.MessageActionRow()
			.addComponents(
				new Discord.MessageButton()
					.setCustomId('support_confirm')
					.setLabel(cf)
					.setStyle('SUCCESS'),
				new Discord.MessageButton()
					.setCustomId('support_cancel')
					.setLabel(cl)
					.setStyle('DANGER'),
			);
		let type = null;
		const filter = (interaction) => true;
		const collector = waitmsg.createMessageComponentCollector({ filter: filter });
		async function getInput(authorId) {
			const filt = m => m.author.id === authorId
			const collected = await message.channel.awaitMessages({ filter: filt, max: 1 });
			return collected.first();
		}
		let ide = null;
		const interval = setInterval(async function () {
			ide = genToken(15);
			const foundt = await Ticket.findOne({ id: ide });
			if (!foundt) return clearInterval(interval);
		}, 1000);
		await wait(5000);
		await waitmsg.edit({ content: askmsg, components: [row1] });
		collector.on('collect', async interaction => {
			if (interaction.user.id !== message.author.id) return interaction.reply({ content: notu, ephemeral: true });
			if (interaction.isSelectMenu()) {
				if (interaction.values[0] === 'type_report') {
					type = 0;
					await interaction.deferUpdate();
					waitmsg.edit({ content: askcmd, components: [row2] });
				}
				else if (interaction.values[0] === 'type_q') {
					type = 1;
					await interaction.deferUpdate();
					waitmsg.edit({ content: askcmd, components: [row2] });
				}
			}
			else if (interaction.isButton()) {
				if (interaction.customId === 'support_cancel') {
					waitmsg.edit({ content: cl2, components: [] });
				}
				else if (interaction.customId === 'support_confirm') {
					if (type === 0) {
						collector.stop();
						const embed = new Discord.MessageEmbed()
							.setTitle("Nuevo ticket")
						await waitmsg.delete();
						waitmsg = await message.channel.send(askrs);
						const rison = await getInput(interaction.user.id);
						await rison.delete();
						waitmsg.edit(cloading.emoji);
						embed.addField("Autor", `${interaction.user.tag} (${interaction.user.id})`)
						embed.addField("Motivo", rison.content)
						embed.addField("Tipo", "reporte")
						embed.addField("ID Ticket", ide)
						embed.setColor("PURPLE")
						const newt = new Ticket()
						newt.openerid = interaction.user.id;
						newt.reason = rison.content;
						newt.id = ide;
						newt.closed = false;
						await newt.save();
						await client.channels.cache.get("893586201246859335").send({ embeds: [embed] });
						await waitmsg.edit(redi);
					}
					else if (type === 1) {
						collector.stop();
						const embed = new Discord.MessageEmbed()
							.setTitle("Nuevo ticket")
						await waitmsg.delete();
						waitmsg = await message.channel.send(askrs);
						const rison = await getInput(interaction.user.id);
						await rison.delete();
						waitmsg.edit(cloading.emoji);
						embed.addField("Autor", `${interaction.user.tag} (${interaction.user.id})`)
						embed.addField("Motivo", rison.content)
						embed.addField("Tipo", "dudas")
						embed.addField("ID Ticket", ide)
						embed.setColor("PURPLE")
						const newt = new Ticket()
						newt.openerid = interaction.user.id;
						newt.reason = rison.content;
						newt.id = ide;
						newt.closed = false;
						await newt.save();
						await client.channels.cache.get("893586201246859335").send({ embeds: [embed] });
						await waitmsg.edit(redi);
					}
				}
			}
		});
	},
};