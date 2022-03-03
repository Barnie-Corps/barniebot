const fetch = require('node-fetch');
const fs = require('fs-extra');
module.exports = {
  name: 'gethtml',
  description: 'gets the html code of a page',
  aliases: ['htmlget', 'get-html', 'html-get'],
  execute: async function(message, args, lang) {
    let nourl = 'Debes introducir la URL.';
    let nohttp = 'La URL debe ser absoluta.';
    if (lang !== null){
      switch (lang.lang) {
        case "en":
        nourl = 'You must enter the URL';
        nohttp = 'The URL must be absolute';
        break;
        case "br":
        nourl = 'Você deve digitar o URL';
        nohttp = 'A URL deve ser absoluta';
        break;
      }
    }
    let targetPage = args[0];
    if (!targetPage) return message.reply(nourl).catch(err => message.channel.send(`Error while replying\n\`${err}\``));
    if (!targetPage.includes("http://") && !targetPage.includes('https://')) return message.reply(nohttp);
    await fetch(targetPage).then(async res => {
      let statusmsg = res.status === 404 ? "Not found" : "Forbidden";
      if (res.status === 404 || res.status === 403) return message.reply(`${res.status} - ${statusmsg}`);
      const response = await res.text();
      const filePath = '../page.html';
      fs.writeFileSync(filePath, 'Loading...');
      const waitmsg = await message.reply('<a:discordproloading:875107406462472212>').catch(err => message.channel.send(`Error while replying\n\`${err}\``));
      setTimeout(async function(){
        fs.writeFileSync(filePath, response);
        await waitmsg.edit({ content: `Status ${res.status}`, files: [filePath] });
        setTimeout(function(){
          fs.writeFileSync(filePath, '------- Waiting for requests -------');
        }, 5000);
      }, 3000);
    }).catch(console.log);
  }
}