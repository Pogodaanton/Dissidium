/* eslint-disable @typescript-eslint/no-empty-function */
import { CacheType, CommandInteraction, SlashCommandBuilder } from "discord.js";
import { staticImplements, ICommandPluginClass } from "../../types/DissidiumPlugin";

@staticImplements<ICommandPluginClass<[]>>()
export default class ServerCommandPlugin {
  static pluginName = "command-server";
  static dependencies = [];

  commandName = "server";
  data = new SlashCommandBuilder()
    .setDMPermission(false)
    .setDefaultMemberPermissions(0)
    .setName("server")
    .setDescription("Replies with server info!");

  onCommandInteraction = async (interaction: CommandInteraction<CacheType>) => {
    await interaction.reply(
      `Server name: ${interaction.guild?.name}\nTotal members: ${interaction.guild?.memberCount}`
    );
  };

  start = async () => {};
  stop = async () => {};
}
