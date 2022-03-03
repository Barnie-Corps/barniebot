module.exports = {
  name: 'ping',
  description: 'Gets client ping',
  aliases: ['pimg', 'pong'],
  execute: async function(message, args, lang){
		message.reply('<a:discordproloading:875107406462472212>').then(sent => {
			sent.edit(`HTTP API: ${sent.createdTimestamp - message.createdTimestamp}ms\n\nApi heartbeat: ${message.client.ws.ping}ms`);
		}).catch(err => message.channel.send(`Error while replying\n\`${err}\``));
  }
}