import {
  ButtonInteraction,
  CacheType,
  Client,
  CommandInteraction,
  Snowflake,
} from "discord.js";
import { CommandError, isCommandError } from "../types/DissidiumPlugin";

/**
 * Fetch a known guild from Discord.js without it erroring out
 *
 * @param source An initialised client object to retrieve the cached guild from
 * @param guildId The uninque identifier of the guild you want to fetch
 * @returns A cached guild object if successful, else undefined
 */
export const safelyFetchGuild = async (source: Client<true>, guildId: Snowflake) => {
  try {
    const guild = await source.guilds.fetch(guildId);
    return guild;
  } catch (err) {
    return undefined;
  }
};

/**
 * Replies an interaction with an error message.
 *
 * @param interaction A user interaction object from Discord.js
 * @param message The error message to send to the user
 */
export const replyError = async (
  interaction: CommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  message?: string | CommandError
) => {
  if (!message)
    message = `We've encountered an unexpected error. If this happens regularly, please notify the server admin.`;

  // We specify the error type for the user for easier troubleshooting
  if (isCommandError(message))
    message = message.userCaused
      ? message.reason
      : `Unexpected server error: ${message.reason}`;

  const replyObj = {
    ephemeral: true,
    content: `:x: ${message}`,
  };

  // Handle deferred reply cases
  if (interaction.deferred || interaction.replied)
    return await interaction.editReply(replyObj);
  return await interaction.reply(replyObj);
};
