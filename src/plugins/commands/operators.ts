/* eslint-disable @typescript-eslint/no-empty-function */
import { CacheType, SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { DissidiumConfig } from "../../types/Dissidium";
import {
  staticImplements,
  ICommandPluginClass,
  CommandError,
} from "../../types/DissidiumPlugin";
import CommandInteractionPlugin from "../commands";
import DatabasePlugin from "../database";

@staticImplements<
  ICommandPluginClass<[DatabasePlugin, CommandInteractionPlugin, DissidiumConfig]>
>()
export default class OperatorsCommandPlugin {
  static pluginName = "command-op";
  static dependencies = ["database", "commandInteraction", "config"];

  commandName = "op";
  data = new SlashCommandBuilder()
    .setName("op")
    .setDMPermission(false)
    .setDefaultMemberPermissions(0)
    .setDescription(
      "(Deprecated) Assign and remove bot operators who receive permissions to the remaining commands."
    );

  /**
   * Executes each time a user uses a slash command that refers to this class.
   *
   * @param interaction A live interaction object from Discord.js
   */
  onCommandInteraction = async (interaction: ChatInputCommandInteraction<CacheType>) => {
    if (!interaction.inGuild())
      throw new CommandError("This command is only executable in guild text-channels.");

    interaction.reply({
      ephemeral: true,
      isMessage: true,
      embeds: [
        {
          title:
            ":information_source: Command permissions are now managed in the server settings",
          description:
            "To change who can use which command, go to:\n`Server Settings` ➞ `Integrations` ➞ `Dissidium`",
          footer: {
            text: "This command will be eventually removed in a later update.",
          },
        },
      ],
    });
  };

  constructor() {}

  start = async () => {};
  stop = async () => {};
}
