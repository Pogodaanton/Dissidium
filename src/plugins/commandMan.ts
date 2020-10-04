import { CommandPlugin } from "../utils/PluginStructs";
import { Message, MessageEmbed } from "discord.js";
import Plugin from "../utils/PluginStructs";
import DatabaseMan from "./databaseMan";

export const generateHelpEmbed = (commandHandler: CommandPlugin): MessageEmbed => {
  const {
    config: { prefix },
    command,
    usage,
  } = commandHandler;

  if (usage.length <= 0) usage.push(command);

  return new MessageEmbed({
    color: "aliceblue",
    author: {
      name: `Usage examples: ${prefix}${command}`,
    },
    footer: {
      text: `Use "${prefix}help ${command}" for more info`,
    },
    description: usage
      .map(example => `\`\`\`${prefix}${example.trim()}\`\`\``)
      .join("\n"),
  });
};

export class CommandArguments {
  args: string[] = [];
  message: Message;

  constructor(args: string[], message: Message) {
    this.args = args;
    this.message = message;
  }

  getContent = (): string => this.args.join(" ");
  getArgs = (): string[] => this.args;

  /**
   * Makes sure all required arguments are defined.
   *
   * The check is based on whitespace splitting, write your own
   * argument check in complex scenarios.
   */
  checkRequired = (commandHandler: CommandPlugin): boolean => {
    const { args } = commandHandler;

    if (this.args.length >= args.filter(val => typeof val === "string").length) {
      return true;
    }

    this.sendRequiredArgs(commandHandler);
    return false;
  };

  /**
   * Alerts the requesting user to provide more arguments.
   */
  sendRequiredArgs = async (commandHandler: CommandPlugin): Promise<void> => {
    const { channel } = this.message;

    await channel.send(
      `You need to provide more arguments, <@${this.message.author}>!`,
      generateHelpEmbed(commandHandler)
    );

    return;
  };

  sendUsage = async (commandHandler: CommandPlugin): Promise<void> => {
    const { channel, author } = this.message;

    await channel.send(`Bad syntax, <@${author}>!`, generateHelpEmbed(commandHandler));
    return;
  };
}

/**
 * Handles chat commands
 */
export default class CommandMan extends Plugin {
  static dependencies = ["databaseMan"];
  databaseMan = this.bot.plugins.get("DatabaseMan") as DatabaseMan;

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

      commandHandler.execute(message, new CommandArguments(args, message));
    });
  };
}
