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

export type UsageObject = {
  /**
   * Arguments for which the help plugin should show
   * the contents of this object to the user.
   */
  keywords?: string[];
  /**
   * The usage example for a specific argument without the command name.
   */
  example: string;
  /**
   * An explanation to the given example for what it does.
   */
  description: string;
  /**
   * Reserved space for explaining the arguments in the example.
   * These are shown to the user if they specify their help request to the given argument.
   */
  arguments?: {
    /**
     * Name of the argument.
     */
    name: string;
    /**
     * A description of the argument.
     */
    description: string;
    /**
     * Marks the argument as not mandatory.
     * Note that optional arguments may only come **after** mandatory ones.
     */
    optional?: boolean;
  }[];
};

export type UsageArray = Array<UsageObject | string>;

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
  usage: UsageArray = [];

  /**
   * AUTOMATICALLY generated cache for making help indexing more efficient.
   * @readonly Should only be altered by registerCommand().
   */
  USAGE_INDEX_CACHE: {
    [key: string]: number;
  } = {};

  /**
   * Command usage cooldown
   * @default 5
   */
  cooldown = 5;

  /**
   * Defines who may use the command.
   */
  adminOnly = true;

  execute: (
    message: Message,
    args: string[],
    sendHelp: (args?: string[]) => void
  ) => void = () => {
    console.error("Command function not implemented!");
  };

  protected registerCommand = (): void => {
    if (!this.command) throw new Error("Command name not implemented!");

    // Populate index cache
    this.usage.forEach((syntax, index) => {
      if (typeof syntax !== "string" && syntax.keywords && syntax.keywords.length > 0) {
        syntax.keywords.forEach(keyword => {
          this.USAGE_INDEX_CACHE[keyword] = index;
        });
      }
    });

    this.bot.commands.set(this.command.toLowerCase(), this);
  };

  load = (): void => {
    this.registerCommand();
  };
}

export default Plugin;
