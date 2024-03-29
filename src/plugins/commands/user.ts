/* eslint-disable @typescript-eslint/no-empty-function */
import { SlashCommandBuilder, CacheType, CommandInteraction } from "discord.js";
import { staticImplements, ICommandPluginClass } from "../../types/DissidiumPlugin";

@staticImplements<ICommandPluginClass<[]>>()
export default class UserCommandPlugin {
  static pluginName = "command-user";
  static dependencies = [];

  commandName = "user";
  data = new SlashCommandBuilder()
    .setDMPermission(true)
    .setDefaultMemberPermissions(0)
    .setName("user")
    .setDescription("Replies with user info!");

  onCommandInteraction = async (interaction: CommandInteraction<CacheType>) => {
    await interaction.reply({
      ephemeral: true,
      content: `Your tag: ${interaction.user.tag}\nYour id: ${interaction.user.id}`,
    });
  };

  start = async () => {};
  stop = async () => {};
}
