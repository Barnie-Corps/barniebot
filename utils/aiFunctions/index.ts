import coreFunctions from "./core";
import investigationFunctions from "./investigation";
import channelsFunctions from "./channels";
import membersFunctions from "./members";
import workspaceFunctions from "./workspace";
import moderationFunctions from "./moderation";
import ticketsFunctions from "./tickets";
import rpgFunctions from "./rpg";
import guildConfigFunctions from "./guildConfig";
import diagnosticsFunctions from "./diagnostics";
import memoryFunctions from "./memory";
import guildToolsFunctions from "./guildTools";

export default {
  ...coreFunctions,
  ...investigationFunctions,
  ...channelsFunctions,
  ...membersFunctions,
  ...workspaceFunctions,
  ...moderationFunctions,
  ...ticketsFunctions,
  ...rpgFunctions,
  ...guildConfigFunctions,
  ...diagnosticsFunctions,
  ...memoryFunctions,
  ...guildToolsFunctions,
};
