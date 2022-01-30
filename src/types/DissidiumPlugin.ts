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
  pluginName: string;
  dependencies: string[];
}

interface IDissidiumPluginObj {
  start(): Promise<void>;
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
  commandName: string;
  data: SlashCommandBuilder;
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
