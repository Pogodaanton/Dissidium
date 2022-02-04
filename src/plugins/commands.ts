/* eslint-disable @typescript-eslint/no-empty-function */
import {
  CacheType,
  Client,
  Collection,
  CommandInteraction,
  Interaction,
} from "discord.js";
import { REST } from "@discordjs/rest";
import { RESTPostAPIApplicationCommandsJSONBody, Routes } from "discord-api-types/v9";
import {
  staticImplements,
  IDissidiumPluginClass,
  CommandPlugin,
  isCommandPlugin,
  CommandError,
  isCommandError,
} from "../types/DissidiumPlugin";
import { DissidiumConfig } from "../types/Dissidium";
import Plugineer from "../utils/plugineer";

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

  private checkForStalledPlugins = async () => {
    if (this.plugineer.uninitializedPlugins.hasAny(...this.stalledPlugins)) return;

    // Only continue if all stalled plugins have been initiated
    this.plugineer.events.off("dependency-resolved", this.checkForStalledPlugins);
    this.unregisteredPlugins = [...this.unregisteredPlugins, ...this.stalledPlugins];
    this.stalledPlugins = [];

    await this.registerCommands();
  };

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
  };

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

    await this.deployCommands();
  };

  private deployCommands = async () => {
    const commandsJSON: RESTPostAPIApplicationCommandsJSONBody[] = [];
    this.commands.forEach(cmdPlugin => commandsJSON.push(cmdPlugin.data.toJSON()));

    try {
      const rest = new REST({ version: "9" }).setToken(this.config.token);
      await rest.put(
        Routes.applicationGuildCommands(this.config.ownerUserId, this.config.testGuildId),
        {
          body: commandsJSON,
        }
      );

      console.log("Successfully registered application commands.");
    } catch (err) {
      console.error(err);
    }
  };

  /**
   * Sends an error message to the user.
   *
   * @param interaction A user command interaction object from Discord.js
   * @param message The error message to send to the user
   */
  private sendError = async (
    interaction: CommandInteraction<CacheType>,
    message?: string | CommandError
  ) => {
    if (!message)
      message = `We've encountered an unexpected error. If this happens regularly, please notify the server admin.`;

    if (isCommandError(message))
      message = message.userCaused
        ? message.reason
        : `Unexpected server error: ${message.reason}`;

    return await interaction.reply({
      ephemeral: true,
      content: `:x: ${message}`,
    });
  };

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
        await this.sendError(interaction);
        return;
      }

      // Handle expected (user) errors
      await this.sendError(interaction, err);
    }
  };

  start = async () => {
    await this.fetchCommands();

    // Hooking to discord events
    this.client.on("interactionCreate", this.handleInteraction);
  };

  stop = async () => {
    // Unhooking discord events
    this.client.off("interactionCreate", this.handleInteraction);
  };
}
