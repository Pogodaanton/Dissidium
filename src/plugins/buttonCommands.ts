/* eslint-disable @typescript-eslint/no-empty-function */
import {
  ButtonInteraction,
  CacheType,
  Client,
  Collection,
  Interaction,
  Snowflake,
} from "discord.js";
import {
  staticImplements,
  IDissidiumPluginClass,
  CommandError,
  isCommandError,
  ButtonCommandHandler,
  DissidiumPlugin,
} from "../types/DissidiumPlugin";

@staticImplements<IDissidiumPluginClass>()
export default class ButtonInteractionPlugin {
  static pluginName = "buttonInteraction";
  static dependencies = ["client"];

  constructor(private client: Client<boolean>) {}

  // Button handler registry
  buttonHandlers = new Collection<string, ButtonCommandHandler>();

  /**
   * Assign a function to handle a specific button command.
   * The function returns a unique identifier on which it will redirect the command to the callback.
   *
   * @param caller The calling plugin
   * @param localId The unique identifier of the button inside of the plugin
   * @param callback The listener that is called if the given button is invoked
   * @returns The ID to assign the button to.
   */
  setButtonListener = (
    caller: DissidiumPlugin,
    localId: string,
    callback: ButtonCommandHandler
  ) => {
    const customId =
      (caller.constructor as IDissidiumPluginClass).pluginName + ":" + localId;
    this.buttonHandlers.set(customId, callback);
    return customId;
  };

  /**
   * Unlinks any listener to a given button.
   *
   * @param caller The calling plugin
   * @param localId The unique identifier of the button inside of the plugin
   * @returns Whether the deletion was successful or not
   */
  removeButtonListener = (caller: DissidiumPlugin | string, localId?: string) => {
    if (typeof caller === "string") return this.buttonHandlers.delete(caller);
    if (typeof localId !== "string")
      throw new SyntaxError("Paramtere localId is missing in removeButtonListener.");

    const customId =
      (caller.constructor as IDissidiumPluginClass).pluginName + ":" + localId;
    return this.buttonHandlers.delete(customId);
  };

  /**
   * Fetch a known guild from Discord.js.
   * This is a helpful method for every case where you don't have an interaction object
   * to retrieve it from.
   *
   * @param guildId The uninque identifier of the guild you want to fetch
   * @returns A hydrated guild object
   */
  fetchGuild = async (guildId: Snowflake) => await this.client.guilds.fetch(guildId);

  /**
   * Sends an error message to the user.
   *
   * @param interaction A user command interaction object from Discord.js
   * @param message The error message to send to the user
   */
  private sendError = async (
    interaction: ButtonInteraction<CacheType>,
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
    if (!interaction.isButton()) return;

    const { customId } = interaction;
    const buttonHandler = this.buttonHandlers.get(customId);
    if (!buttonHandler) return;

    try {
      // We strip away the plugin-specific prefix we use to keep the ids unique
      const localIdStart = customId.indexOf(":");
      interaction.customId = customId.substring(localIdStart + 1);

      await buttonHandler(interaction);
    } catch (err) {
      // Handle unexpected errors (We print them to the console)
      if (!isCommandError(err)) {
        console.error(`Button press: ${customId} - Error:`, err);
        await this.sendError(interaction);
        return;
      }

      // Handle expected (user) errors
      await this.sendError(interaction, err);
    }
  };

  start = async () => {
    // Hooking to discord events
    this.client.on("interactionCreate", this.handleInteraction);
  };

  stop = async () => {
    // Unhooking discord events
    this.client.off("interactionCreate", this.handleInteraction);
  };
}
