import { join } from "path";
import Plugin, { CommandPlugin, UsageArray } from "../../utils/PluginStructs";
import { Message } from "discord.js";
import DatabaseMan from "../databaseMan";
import { sendError } from "../../utils";

/**
 * A command to reload parts of the command parser
 */
export default class PluginReloader extends CommandPlugin {
  command = "reload";
  usage: UsageArray = [
    {
      example: "<COMMAND NAME>",
      description: "Reloads the plugin for a given command.",
    },
    {
      example: "db",
      description: "Reloads the database.",
    },
  ];

  reloadDatabase = async (message: Message): Promise<void> => {
    const db = this.bot.plugins.get("DatabaseMan") as DatabaseMan | undefined;
    if (!db) return sendError(message, `DatabaseMan is not available!`);

    // await db.unload();
    await db.load();
    message.react("✅");
  };

  execute = async (message: Message, args: string[]): Promise<void> => {
    if (!args[0]) return;

    const commandName = args[0].toLowerCase();

    if (commandName === "db") {
      return this.reloadDatabase(message);
    }

    const command =
      this.bot.commands.get(commandName) ||
      this.bot.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) {
      message.channel.send(
        `There is no command with name or alias \`${commandName}\`, ${message.author}!`
      );
      return;
    }

    let commandsPath = this.bot.pluginPaths.get("commands");
    if (!commandsPath) return sendError(message, "No path for command plugins assigned.");
    commandsPath = join(__dirname, "../../", commandsPath, "./" + command.command);

    delete require.cache[require.resolve(commandsPath)];
    await this.bot.unloadPlugin(command);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const NewCommand: typeof Plugin = require(commandsPath).default;
      const reloadedPlugin = new NewCommand(this.bot);

      this.bot.plugins.set(NewCommand.name, reloadedPlugin);
      await reloadedPlugin.load();
      message.react("✅");
    } catch (error) {
      console.error(error);

      let errorMsg =
        "Couldn't retrieve error details, please take a look at the console.";

      if (
        typeof error.message !== "undefined" &&
        typeof error.message.toString !== "undefined"
      ) {
        /**
         * Removing ANSI styling to make the output more readable on Discord
         */
        errorMsg = error.message.toString().replace(
          // eslint-disable-next-line no-control-regex
          /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
          ""
        );
      }

      message.channel.send(
        `❌ There was an error while reloading the command \`${command.command}\`:\n\`\`\`${errorMsg}\`\`\``
      );
    }
  };
}
