/* eslint-disable @typescript-eslint/no-empty-function */
import { CacheType, Client, Collection, Guild, Interaction, Snowflake } from "discord.js";
import { REST } from "@discordjs/rest";
import { RESTPostAPIApplicationCommandsJSONBody, Routes } from "discord-api-types/v9";
import {
  staticImplements,
  IDissidiumPluginClass,
  CommandPlugin,
  isCommandPlugin,
  isCommandError,
} from "../types/DissidiumPlugin";
import { DissidiumConfig } from "../types/Dissidium";
import Plugineer from "../utils/plugineer";
import EventEmitter from "events";
import { replyError } from "../utils/helpers";

type GuildCommandResponse = {
  id: Snowflake;
  application_id: Snowflake;
  guild_id: Snowflake;
  name: string;
}[];

const isGuildCommandsResponse = (arg: unknown): arg is GuildCommandResponse => {
  if (!Array.isArray(arg)) return false;
  if (arg.length <= 0) return true;

  const firstItem = arg[0];
  return (
    typeof firstItem.name === "string" &&
    typeof firstItem.id === "string" &&
    typeof firstItem.application_id === "string" &&
    typeof firstItem.guild_id === "string"
  );
};

@staticImplements<IDissidiumPluginClass>()
export default class CommandInteractionPlugin {
  static pluginName = "commandInteraction";
  static dependencies = ["client", "config", "plugineer"];

  constructor(
    private client: Client<boolean>,
    private config: DissidiumConfig,
    private plugineer: Plugineer
  ) {}

  // Command plugins we are still waiting for to have their dependencies resolved
  stalledPlugins: string[] = [];

  // Command plugins we still have to register
  unregisteredPlugins: string[] = [];

  // Commands registry
  commands = new Collection<string, CommandPlugin>();

  // Command id registry per guild
  // Stores command name -> command id per guild
  guildCommandIds = new Collection<Snowflake, Collection<string, Snowflake>>();

  /**
   * Event emitter instance for various command related events
   */
  events = new EventEmitter();

  /**
   * Callback function for handling dependency resolvings.
   * Some command plugins need others for them to work, so we wait loading them until their dependencies are loaded in.
   */
  private checkForStalledPlugins = async () => {
    if (this.plugineer.uninitializedPlugins.hasAny(...this.stalledPlugins)) return;

    // Only continue if all stalled plugins have been initiated
    this.plugineer.events.off("dependency-resolved", this.checkForStalledPlugins);
    this.unregisteredPlugins = [...this.unregisteredPlugins, ...this.stalledPlugins];
    this.stalledPlugins = [];

    await this.registerCommands();
    await this.deployCommandsToAllGuilds();
  };

  /**
   * Starts loading all command handler plugins into the system.
   * Due to dependency resolvance, not all plugins might be loaded until this method finishes.
   */
  private fetchCommands = async () => {
    const { pluginsLoaded, pluginsStalled } = await this.plugineer.loadPlugins(
      "./plugins/commands/"
    );

    this.unregisteredPlugins = [...pluginsLoaded];
    this.stalledPlugins = [...pluginsStalled];

    if (this.stalledPlugins.length > 0) {
      this.plugineer.events.on("dependency-resolved", this.checkForStalledPlugins);
      return;
    }

    await this.registerCommands();
    await this.deployCommandsToAllGuilds();
  };

  /**
   * Denotes all valid command plugins in the queue as completely loaded.
   */
  private registerCommands = async () => {
    for (const pluginName of this.unregisteredPlugins) {
      const plugin = this.plugineer.plugins.get(pluginName);
      if (!plugin) continue;

      if (!isCommandPlugin(plugin)) {
        console.log(
          `Warning: Plugin "${pluginName}" was loaded, but cannot be interpreted as a command plugin. Make sure to use the proper interfaces.`
        );
        continue;
      }

      this.commands.set(plugin.commandName, plugin);
    }
  };

  /**
   * Reports all loaded command plugins to the Discord API
   * and enables their usage on all guilds the bot is currently in.
   */
  private deployCommandsToAllGuilds = async () => {
    for (const guildId of this.client.guilds.cache.keys())
      await this.deployCommandsToGuild(guildId);
  };

  /**
   * Reports all loaded command plugins to the Discord API
   * and enables their usage on a given guild.
   *
   * @param guildId The guild to register the commands to
   */
  private deployCommandsToGuild = async (guildId: Snowflake) => {
    const commandsJSON: RESTPostAPIApplicationCommandsJSONBody[] = [];
    this.commands.forEach(cmdPlugin => commandsJSON.push(cmdPlugin.data.toJSON()));

    try {
      console.log("deployCommandsToGuild:", "Deploying to...", guildId);
      const rest = new REST({ version: "9" }).setToken(this.config.token);
      const res = await rest.put(
        Routes.applicationGuildCommands(this.config.clientId, guildId),
        {
          body: commandsJSON,
        }
      );

      // Store registered command IDs
      if (!isGuildCommandsResponse(res)) throw new Error("Could not store command IDs!");
      const guildStore = this.guildCommandIds.ensure(guildId, () => new Collection());
      for (const command of res) {
        guildStore.set(command.name, command.id);
      }

      // We notify plugins that a new guild which can receive commands has appeared
      setTimeout(() => this.events.emit("guild-commands-deployed", guildId), 200);
    } catch (err) {
      console.error("deployCommandsToGuild:", "error", err);
    }
  };

  /**
   * Handles command user interactions and forwards it to the
   * appropriate plugin if there is one.
   *
   * @param interaction A live command interaction object from Discord.js
   */
  private handleInteraction = async (interaction: Interaction<CacheType>) => {
    if (!interaction.isCommand()) return;

    const command = this.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.onCommandInteraction(interaction);
    } catch (err) {
      // Handle unexpected errors (We print them to the console)
      if (!isCommandError(err)) {
        console.error(`/${interaction.commandName} - Error:`, err);
        await replyError(interaction);
        return;
      }

      // Handle expected (user) errors
      await replyError(interaction, err);
    }
  };

  /**
   * Handles cases where the bot joins a new guild.
   * @param guild The guild the bot joined to
   */
  private handleGuildCreate = async (guild: Guild) =>
    await this.deployCommandsToGuild(guild.id);

  start = async () => {
    await this.fetchCommands();

    // Hooking to discord events
    this.client.on("interactionCreate", this.handleInteraction);
    this.client.on("guildCreate", this.handleGuildCreate);
  };

  stop = async () => {
    // Unhooking from discord events
    this.client.off("interactionCreate", this.handleInteraction);
    this.client.off("guildCreate", this.handleGuildCreate);
  };
}
