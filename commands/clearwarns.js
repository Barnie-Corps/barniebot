const Warn = require('../models/warns');
module.exports = {
  name: "clearwarns",
  description: null,
  aliases: ["removewarns"],
  tier: 0,
  execute: async function(message, args, lang) {
	function reply(content) {
		return message.reply(content).catch(error => message.channel.send(`Error while replying: \n\`${error}\``));
	}
		const { guild, content, author, channel } = message;
    let noperms = 'No tienes permisos para usar este comando.';
		let nouser = 'Debes mencionar al usuario cuyas advertencias deseas borrar.';
		let yawarn = 'Advertencias removidas con éxito.';
		let nowarn = 'El usuario no cuenta con ninguna advertencia.';
		if (lang !== null) {
			switch (lang.lang) {
			case 'en':
				noperms = 'You do not have permissions to use this command.';
				nouser = 'You must mention the user whose warnings you want to delete.';
				yawarn = 'Warnings removed successfully.';
				nowarn = 'The user does not have any warning.';
				break;
			case 'br':
				noperms = 'Você não tem permissão para usar este comando.';
				nouser = 'Você deve mencionar o usuário cujos avisos deseja excluir.';
				yawarn = 'Avisos removidos com sucesso.';
				nowarn = 'O usuário não tem nenhum aviso.';
				break;
			}
    }
			if (!message.member.permissions.has('MANAGE_MESSAGES')) return reply(`<a:alertapro:869607044892741743> - ${noperms}`);
			const targetu = message.mentions.users.first();
			if (!targetu) return reply(`<a:alertapro:869607044892741743> - ${nouser}`);
			const foundW = await Warn.findOne({ guildid: guild.id, userid: targetu.id });
			if (!foundW || foundW && foundW.warns.length < 1) return reply(`<a:alertapro:869607044892741743> - ${nowarn}`);
			foundW.warns = [];
			await foundW.save();
			reply(yawarn);
  }
}