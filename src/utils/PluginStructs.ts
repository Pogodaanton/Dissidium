import { CommandArguments } from "../plugins/commandMan";
import { Message } from "discord.js";
import Dissidium from "../bot";

class Plugin {
  bot;
  client;
  config;

  /**
   * Array of required plugin filenames.
   *
   * @static
   * @type {string[]}
   * @memberof CommandPlugin
   */
  static dependencies: string[] = [];

  constructor(bot: Dissidium) {
    this.bot = bot;
    this.client = bot.client;
    this.config = bot.config;
  }

  load = (): void => {
    throw new Error("Unimplemented load function!");
  };

  unload = (): void => {
    return;
  };
}

export class CommandPlugin extends Plugin {
  /**
   * The primary command name
   */
  command = "";

  /**
   * An array with command aliases.
   */
  aliases: string[] = [];

  /**
   * A simple description for the command.
   */
  description = "";

  /**
   * An array with possible arguments.
   * Use an object with `optional: true` to make an argument optional.
   *
   * Be aware that optional commands may only come ___after___ all required ones.
   */
  args: ({ name: ""; optional: true } | string)[] = [];

  /**
   * An array with usage examples.
   * If this is populated, showing this to the user will be preffered over `this.args`.
   */
  usage: string[] = [];

  /**
   * Command usage cooldown
   * @default 5
   */
  cooldown = 5;

  /**
   * Defines who may use the command.
   */
  adminOnly = true;

  execute: (message: Message, args: CommandArguments) => void = () => {
    console.error("Command function not implemented!");
  };

  registerCommand = (): void => {
    if (!this.command) throw new Error("Command name not implemented!");
    this.bot.commands.set(this.command.toLowerCase(), this);
  };

  load = (): void => {
    this.registerCommand();
  };
}

export default Plugin;
