import { Message } from "discord.js";
import Plugin from "../utils/PluginStructs";
import DatabaseMan from "./databaseMan";

/**
 * Handles chat commands
 */
export default class CommandMan extends Plugin {
  static dependencies = ["databaseMan"];
  databaseMan = this.bot.plugins.get("DatabaseMan") as DatabaseMan;

  sendHelp = (message: Message, commandName: string) => (args: string[] = []): void => {
    return this.bot.commands.get("help")?.execute(message, [commandName, ...args], () => {
      return;
    });
  };

  load = (): void => {
    this.client.on("message", async message => {
      if (
        !message.content.startsWith(this.config.prefix) ||
        message.author.bot ||
        typeof this.databaseMan === "undefined"
      )
        return;

      const args = message.content.slice(this.config.prefix.length).trim().split(/ +/);
      const commandName = (args.shift() ?? "").toLowerCase();

      const commandHandler =
        this.bot.commands.get(commandName) ||
        this.bot.commands.find(handler => handler.aliases.includes(commandName));
      if (!commandHandler || message.channel.type !== "text") return;

      /**
       * Only allow bot-masters and users with administrator priviliges
       * if necessary.
       */
      if (commandHandler.adminOnly) {
        const masters = await this.databaseMan.getGuildData<string[]>(
          message.guild,
          "masters"
        );

        if (
          !message.guild?.member(message.author)?.permissions.has("ADMINISTRATOR") &&
          masters &&
          typeof masters.length === "number" &&
          !masters.includes(message.author.id)
        ) {
          return;
        }
      }

      commandHandler.execute(
        message,
        args,
        this.sendHelp(message, commandHandler.command)
      );
    });
  };
}
