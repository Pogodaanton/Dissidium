import { join } from "path";
import Plugin, { CommandPlugin } from "../utils/PluginStructs";
import { Message } from "discord.js";
import DatabaseMan from "./databaseMan";
import { sendError } from "../utils";

/**
 * A command to reload parts of the command parser
 */
export default class PluginReloader extends CommandPlugin {
  command = "reload";
  args = ["existing-command-name"];

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
    commandsPath = join(__dirname, "../", commandsPath, "./" + command.command);

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
      message.channel.send(
        `There was an error while reloading a command \`${command.command}\`:\n\`${error.message}\``
      );
    }
  };
}
