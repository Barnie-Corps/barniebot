const Cmd = require('../models/customcmds');
const Prefixes = require('../models/prefixes');
module.exports = {
  name: 'customcmd',
  description: 'Creates a custom command',
  aliases: ['cmd', 'cmdcustom', 'custom-commmand', 'custom-cmd', 'customcommand', 'customcmds'],
  execute: async function(message, args, lang) {
	let prefix;
	const LocalPrefix = await Prefixes.findOne({ guildid: message.guild.id });
	if (LocalPrefix) {
		prefix = LocalPrefix.prefix;
	}
	else {
		prefix = "b.";
	}
    async function reply(content) {
      return await message.reply(content).catch(err => message.channel.send(`Error while replying\n\`${err}\``))
    }
    const types = ['add', 'delete', 'edit', 'view'];
    let noperms = 'No tienes permisos para usar este comando.';
    let notype = 'Debes introducir una acción.';
    let notx = 'Esa acción es inválida.\n\`add\`, `delete`, `edit`, `view`';
    let yaexist = 'Ya existe un comando con ese nombre en este servidor.';
    let noname = 'Debes introducir el nombre del comando.';
    let noresp = 'Debes introducir la respuesta.';
    let liso = 'Acción completada con éxito.';
    let nofcmd = 'Comando no encontrado.';
    if (lang !== null) {
      switch (lang.lang) {
        case "en":
        noperms = 'You don\' have permissions to use this command.';
        notype = 'You must enten an action.';
        notx = 'Tha action is not valid.\n`add`, `delete`, `edit`, `view`';
        yaexist = 'there is already a command with that name in this server.';
        noname = 'You must enter the command\'s name';
        noresp = 'You must enter the response.';
        liso = 'Action successfully completed';
        nofcmd = 'Command not found.';
        break;
        case "br":
        noperms = 'Você não tem permissão para usar este comando.';
        notype = 'Você deve entrar em uma ação.';
        notx = 'Essa ação é inválida.\n`add`, `delete`, `edit`, `view`';
        yaexist = 'Um comando com esse nome já existe neste servidor.';
        noname = 'Você deve digitar o nome do comando.';
        noresp = 'Você deve inserir a resposta.';
        liso = 'Ação concluída com sucesso.';
        nofcmd = 'Comando não encontrado.';
        break;
      }
    }
    const action = args[0];
    if (!action) return reply(notype);
    if (!types.includes(action.toLowerCase())) return reply(notx);
    let foundC = null;
    if (action.toLowerCase() === 'add') {
      if (!message.member.permissions.has('MANAGE_CHANNELS')) return reply(noperms);
      const cname = args[1];
      if (!cname) return reply(noname);
      foundC = await Cmd.findOne({ guildid: message.guild.id, triggerer: cname.toLowerCase() });
      if (foundC) return reply(yaexist);
      const cresp = args.slice(2).join(" ");
      if (!cresp) return reply(noresp);
      const newC = new Cmd();
      newC.guildid = message.guild.id;
      newC.triggerer = cname.toLowerCase();
      newC.response = cresp;
      await newC.save();
      reply(liso);
    }
    else if (action.toLowerCase() === 'edit') {
      if (!message.member.permissions.has('MANAGE_CHANNELS')) return reply(noperms);
      const cname = args[1];
      if (!cname) return reply(noname);
      foundC = await Cmd.findOne({ guildid: message.guild.id, triggerer: cname.toLowerCase() });
      if (!foundC) return reply(nofcmd);
      const cresp = args.slice(2).join(" ");
      if (!cresp) return reply(noresp);
      foundC.response = cresp;
      await foundC.save();
      reply(liso);
    }
    else if (action.toLowerCase() === 'view') {
      foundC = await Cmd.find({  guildid: message.guild.id });
      reply(`\`\`\`\n${foundC.length > 0 ? foundC.map(cmd => `${prefix}${cmd.triggerer}`).join("\n\n") : '0 commands'}\n\`\`\``);
    }
    else if (action.toLowerCase() === 'delete') {
      if (!message.member.permissions.has('MANAGE_CHANNELS')) return reply(noperms);
      const cname = args[1];
      if (!cname) return reply(noname);
      foundC = await Cmd.findOne({ guildid: message.guild.id, triggerer: cname.toLowerCase() });
      if (!foundC) return reply(nofcmd);
      await foundC.delete();
      reply(liso);
    }
  }
}