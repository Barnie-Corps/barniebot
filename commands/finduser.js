module.exports = {
  name: 'finduser',
  description: 'Searchs an user',
  aliases: ['buscar', 'buscarusuario'],
  tier: 2,
  execute: async function(message, args, lang) {
    const client = message.client;
		const name = args.slice(0).join(' ');
    let noname = "Debes introducir un nombre para buscar.";
    let nouser = "No pude encontrar ese usuario.";
    let loading1 = "Cargando...";
    let loaded = "Datos cargados con éxito";
    let loading2 = "Cargando estructura de los datos...";
    let finish = "Terminando proceso...";
    let noserver = 'No tengo servidores en común con el usuario.';
    if (lang !== null) {
      switch (lang.lang) {
        case "en":
        noname = "You must enter a name to search for.";
        nouser = "I couldn't find that user.";
        loading1 = "Loading...";
        loaded = "Data successfully loaded";
        loading2 = "Loading data structure...";
        finish = "Finishing process...";
        noserver = `I don't`
        break;
        case "br":
        noname = "Você deve digitar um nome a ser procurado.";
        nouser = "Eu não consegui encontrar este usuário.";
        loading1 = "Carregando...";
        loaded = "Dados carregados com sucesso";
        loading2 = "Carregando estrutura de dados...";
        finish = "Processo de finalização...";
        break;
      }
    }
		if (!name) return message.reply(noname)
		const useR = client.users.cache.find(u => u.username === name || u.username.includes(name));
		if (!useR) {
			return message.reply(`<a:cargando:841741435568783401> ${loading1}`).then(msg => {
				setTimeout(function() {
					msg.edit(`<a:marcasi:800125816633557043> ${nouser}`);
				}, 2500);
			});
		}
		let server = '.';
		let canal = '.';
		client.guilds.cache.forEach(guild => {
			if (guild.members.cache.has(useR.id) && server === '.') {
				server = guild;
			}
		});
		const waitMsg = await message.reply(`<a:cargando:841741435568783401> ${loading1}`);
		setTimeout(async function() {
			if (server === '.') return waitMsg.edit('<a:marcasi:800125816633557043> ');
			waitMsg.edit(`<a:marcano:800125893892505662> ${loaded}`);
			setTimeout(function() {
				waitMsg.edit(`<a:cargando:841741435568783401> ${loading2}`);
				setTimeout(function() {
					waitMsg.edit(`<a:cargando:841741435568783401> ${finish}`);
					setTimeout(async function() {
						server.channels.cache.forEach(channel => {
							if (channel.type === 'GUILD_TEXT' && canal === '.') {
								canal = channel;
							}
						});
						const invite = await canal.createInvite({ maxAge: 0 });
						waitMsg.edit(`Tag: ${useR.tag}\n\nID: ${useR.id}\n\nInvite: https://discord.gg/${invite.code}`);
					}, 2500);
				}, 2500);
			}, 2500);
		}, 2500);
  }
}