import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, CacheType } from "discord.js";

/**
 * Used for enforcing static variable implementation for classes
 */
export function staticImplements<T>() {
  return <U extends T>(constructor: U) => {
    constructor;
  };
}

/**
 * Plugin to use in Dissidium
 */
export type DissidiumPlugin = IDissidiumPluginObj & IDissidiumPluginStatic;

export interface IDissidiumPluginClass extends IDissidiumPluginStatic {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]): IDissidiumPluginObj;
}

interface IDissidiumPluginStatic {
  /**
   * The name the system will refer to the plugin as.
   * Must be unique, case-sensitive
   */
  pluginName: string;

  /**
   * A list of plugin names this plugin depends on.
   * The given plugins will be injected as constructor parameters on initialization in the same order as they are in this array.
   */
  dependencies: string[];
}

interface IDissidiumPluginObj {
  /**
   * An asynchronous start method typically ran after construction.
   */
  start(): Promise<void>;
  /**
   * An asynchronous stop method ran before unloading the plugin.
   *
   * **Caution**: The current implementation of stop does not guarantee all dependencies to still be loaded. Do not use them in here.
   */
  stop(): Promise<void>;
}

/**
 * Command plugin to use in Dissidium
 */
export type CommandPlugin = ICommandPluginObj;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ICommandPluginClass<T extends any[]> extends IDissidiumPluginClass {
  new (...args: T): ICommandPluginObj;
}

interface ICommandPluginObj {
  /**
   * The commmand the user will have to input to invoke this plugin
   */
  commandName: string;
  /**
   * Slash command metadata used for Discord command identification and registration
   */
  data: SlashCommandBuilder;
  /**
   * Executes each time a user uses a slash command that refers to this class.
   * @param interaction A live interaction object from Discord.js
   */
  onCommandInteraction(interaction: CommandInteraction<CacheType>): Promise<void>;
}

/**
 * Tests an unknown object for it being a usable plugin for Dissidium
 * @param arg An unknown object
 * @returns A note to the compiler that the object is a valid DissidiumPlugin
 */
export function isPluginClass(arg: unknown): arg is IDissidiumPluginClass {
  const examinee = arg as IDissidiumPluginClass;
  if (typeof examinee.dependencies === "undefined") return false;
  if (!Array.isArray(examinee.dependencies)) return false;
  if (typeof examinee.pluginName !== "string") return false;
  return true;
}

/**
 * Tests an unknown object for it being a usable command plugin for Dissidium
 * @param arg An unknown object
 * @returns A note to the compiler that the object is a valid CommandPlugin
 */
export function isCommandPlugin(arg: unknown): arg is CommandPlugin {
  const examinee = arg as CommandPlugin;
  if (
    typeof examinee.data !== "object" ||
    typeof examinee.data.name !== "string" ||
    typeof examinee.data.description !== "string" ||
    typeof examinee.commandName !== "string" ||
    typeof examinee.onCommandInteraction !== "function"
  )
    return false;
  return true;
}
