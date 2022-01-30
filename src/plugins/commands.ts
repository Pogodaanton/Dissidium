/* eslint-disable @typescript-eslint/no-empty-function */
import { CacheType, Client, Collection, Interaction } from "discord.js";
import { REST } from "@discordjs/rest";
import { RESTPostAPIApplicationCommandsJSONBody, Routes } from "discord-api-types/v9";
import {
  staticImplements,
  IDissidiumPluginClass,
  CommandPlugin,
  isCommandPlugin,
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

  // Commands registry
  commands = new Collection<string, CommandPlugin>();

  private fetchCommands = async () => {
    const detectedCommandPlugins = await this.plugineer.loadPlugins(
      "./plugins/commands/"
    );

    for (const pluginName of detectedCommandPlugins) {
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

  private deployCommands = async () => {
    const commandsJSON: RESTPostAPIApplicationCommandsJSONBody[] = [];
    this.commands.forEach(cmdPlugin => commandsJSON.push(cmdPlugin.data.toJSON()));

    try {
      const rest = new REST({ version: "9" }).setToken(this.config.token);
      await rest.put(
        Routes.applicationGuildCommands(this.config.clientId, this.config.guildId),
        {
          body: commandsJSON,
        }
      );

      console.log("Successfully registered application commands.");
    } catch (err) {
      console.error(err);
    }
  };

  private handleInteraction = async (interaction: Interaction<CacheType>) => {
    if (!interaction.isCommand()) return;

    const command = this.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.onCommandInteraction(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  };

  start = async () => {
    await this.fetchCommands();
    await this.deployCommands();

    // Hooking to discord events
    this.client.on("interactionCreate", this.handleInteraction);
  };

  stop = async () => {
    // Unhooking discord events
    this.client.off("interactionCreate", this.handleInteraction);
  };
}
