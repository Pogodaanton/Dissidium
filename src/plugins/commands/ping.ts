/* eslint-disable @typescript-eslint/no-empty-function */
import {
  CacheType,
  CommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { staticImplements, ICommandPluginClass } from "../../types/DissidiumPlugin";

@staticImplements<ICommandPluginClass<[]>>()
export default class PingCommandPlugin {
  static pluginName = "command-ping";
  static dependencies = [];

  commandName = "ping";
  data = new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!")
    .setDMPermission(true)
    .setDefaultMemberPermissions(PermissionFlagsBits.ViewChannel);

  onCommandInteraction = async (interaction: CommandInteraction<CacheType>) => {
    await interaction.reply({ content: "Pong!", fetchReply: true });
    const creationTimestamp = new Date().getTime();
    await interaction.editReply(
      `Pong! Roundtrip latency: ${creationTimestamp - interaction.createdTimestamp}ms`
    );
  };

  start = async () => {};
  stop = async () => {};
}
