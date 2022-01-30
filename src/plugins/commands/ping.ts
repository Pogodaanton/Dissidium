/* eslint-disable @typescript-eslint/no-empty-function */
import { SlashCommandBuilder } from "@discordjs/builders";
import { CacheType, CommandInteraction } from "discord.js";
import { staticImplements, ICommandPluginClass } from "../../types/DissidiumPlugin";

@staticImplements<ICommandPluginClass<[]>>()
export default class PingCommandPlugin {
  static pluginName = "command-ping";
  static dependencies = [];

  commandName = "ping";
  data = new SlashCommandBuilder().setName("ping").setDescription("Replies with Pong!");

  onCommandInteraction = async (interaction: CommandInteraction<CacheType>) => {
    await interaction.reply("Pong!");
  };

  start = async () => {};
  stop = async () => {};
}
