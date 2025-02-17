Update V 3.1.7 Changelog

[!] Tags:
 - ALPHA: It's in early usage, which means it's not completely done and bugs are expected.
 - DEV: It's meant for developers and normal users should just ignore them.
 - BETA: It's completely done but there are still bugs or could be bugs that are being fixed.

[/] Changes:
  - Updated ReplyFunction interface [DEV]

[+] New:
 - Added social category
 - Added Global Chats function (b.command gchat) [ALPHA]
 - Created global_chats MySQL table [DEV]

[-] Removed:
 - Removed discord_users MySQL table [DEV]
 - Removed ChatManager [DEV]

This is the first changelog note, this file will contain all changelogs from V 3.1.7, if it becomes too large (that surely will happen), changelogs will be published on single files as releases in github.

Update V 4.1.7 Changelog :O

[!] Tags:
 - ALPHA: It's in early usage, which means it's not completely done and bugs are expected.
 - DEV: It's meant for developers and normal users should just ignore them.
 - BETA: It's completely done but there are still bugs or could be bugs that are being fixed.

 [/] Changes:
  - Commands avatar, botinfo, setlang and ping were recreated as slash commands
  - index changed to handle and register only slash commands [DEV]

[+] New: 
 - Nothing this time...

[-] Removed: 
 - Commands 'commands', command, gchat, help, prefix, say and setprefix were deleted (say command could come back in a future version, now it is not important)

Have a good day or a good night :D

Update V 4.2.7
[!] Tags:
 - ALPHA: It's in early usage, which means it's not completely done and bugs are expected.
 - DEV: It's meant for developers and normal users should just ignore them.
 - BETA: It's completely done but there are still bugs or could be bugs that are being fixed.

 [/] Changes:
  - Updated packages [DEV]
  - Changed botinfo language translation algorithm incresing it's loading speed
  - Added defering to ping command
  - Modified setlang done message to notify about data collection
  - Modified botinfo's database section to now show real data and not just 0.

 [+] New:
  - New autoTranslate function that recursively translates objects strings to a desiged language [DEV]
  - Added command tracking in the interactionCreate event [DEV]
  - Added user public data registering
  - Added kick command
  - Added github command
  - Added discord_users and executed_commands to the tables created in the queries function [DEV]

 [-] Removed: 
  - Nothing this time...

And that's it.

Update V 4.3.7
[!] Tags:
 - ALPHA: It's in early usage, which means it's not completely done and bugs are expected.
 - DEV: It's meant for developers and normal users should just ignore them.
 - BETA: It's completely done but there are still bugs or could be bugs that are being fixed.

 [/] Changes:
  - Modified index and command files to defer an ephemeral or non-ephemeral reply before any command execution using a new ephemeral propertie on command objects [DEV]
  - Modified data object and interface to add an ecryption key property [DEV]

 [+] New:
  - Created ChatManager class to make global chat easier to manage [DEV]
  - Created commando globalchats and 3 subcommands for its actions: set (channel), toggle, language (language 2 digits code), autotranslate (True/False)
  - Added Global Chats feature [BETA]
  - Added globalchats, global_messages and guilds (Currently not in use) queries [DEV]

 [-] Removed:
  - Nothing this time...

Have a good day.

Update 4.3.8
[!] Tags:
 - ALPHA: It's in early usage, which means it's not completely done and bugs are expected.
 - DEV: It's meant for developers and normal users should just ignore them.
 - BETA: It's completely done but there are still bugs or could be bugs that are being fixed.

 [/] Changes:
  - Owners IDs are now taken from the environment variables, but they still can be inserted directly in the array. [DEV]
  - Updated .env.example to show the new 2 environment variables in use. [DEV]

 [+] New:
  - Added 2 commands for owners that are shutdown and announce. [DEV]
  - Added owners environment variable load into the data object in bot startup [DEV]
  - Added safe shutdown check in bot startup [DEV]
 [-] Removed:
  - Again, nothing...

Lol.

Update 4.4.8
[!] Tags:
 - ALPHA: It's in early usage, which means it's not completely done and bugs are expected.
 - DEV: It's meant for developers and normal users should just ignore them.
 - BETA: It's completely done but there are still bugs or could be bugs that are being fixed.

 [/] Changes:
  - The ChatManager now logs the time it takes for the messages to be dispatched to all active guilds. [DEV]
  - IMPORTANT: Our privacy policy has been updated. We strongly recommend you to read it.

 [+] New:
  - Added 2 commands for owners that are guilds and invite. [DEV]
  - Added a log channel property to the bot config data. This property does not break the bot if not provided, but the code actually expects a valid text channel ID for logging. (See the LogManager) [DEV]
  - Added command privacy that sends the privacy policy.
  - Added command messages to get the messages history of any user (From the global chat, messages sent from other channels are NOT stored) [DEV]

 [-] Removed:
  - Unnecesary interface 'ReplyFunction' and an unnecesary import. [DEV]

What a beautiful day.

 Update 4.5.8
 [!] Tags:
 - ALPHA: It's in early usage, which means it's not completely done and bugs are expected.
 - DEV: It's meant for developers and normal users should just ignore them.
 - BETA: It's completely done but there are still bugs or could be bugs that are being fixed.

 [/] Changes:
  - .env.example file has been updated. [DEV]
  - Minor changes to index.ts [DEV]
  - botinfo command doesn't actually displays disk info.
  - Global chat now prioritizes guilds without the autotranslate option turned on.

 [+] New:
  - Added filter command -> /filter setup to start
  - Added ChatManager sorting to prioritize guilds with not auto translate [DEV]
  - Added 3 tables: filter_configs, filter_words and filter_webhooks. See mysql/queries.ts [DEV]
  - Added messageCreate event listener to handle the filter [DEV]
  - Added filter function (see first addition). Members with ManageMessages permissions are ignored.

  [-] Removed:
   - Nothing this time...

  Shouldn't y'all follow me on ig? [CENSORED INSTAGRAM LINK] lol just join the support guild: https://discord.gg/BKFa6tFYJx