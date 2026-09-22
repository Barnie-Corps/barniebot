import coreDeclarations from "./core";
import conversationDeclarations from "./conversation";
import channelsDeclarations from "./channels";
import membersDeclarations from "./members";
import workspaceDeclarations from "./workspace";
import moderationDeclarations from "./moderation";
import ticketsDeclarations from "./tickets";
import rpgDeclarations from "./rpg";
import guildConfigDeclarations from "./guildConfig";
import diagnosticsDeclarations from "./diagnostics";
import memoryDeclarations from "./memory";
import guildToolsDeclarations from "./guildTools";

export default {
  ...coreDeclarations,
  ...conversationDeclarations,
  ...channelsDeclarations,
  ...membersDeclarations,
  ...workspaceDeclarations,
  ...moderationDeclarations,
  ...ticketsDeclarations,
  ...rpgDeclarations,
  ...guildConfigDeclarations,
  ...diagnosticsDeclarations,
  ...memoryDeclarations,
  ...guildToolsDeclarations,
};
