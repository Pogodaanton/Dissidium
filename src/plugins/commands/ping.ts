import { SlashCommandBuilder } from "@discordjs/builders";
import { CacheType, CommandInteraction } from "discord.js";
import { CommandPlugin } from "../../types/DissidiumPlugin";

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Replies with Pong!"),
  async execute(interaction: CommandInteraction<CacheType>) {
    await interaction.reply("Pong!");
  },
} as CommandPlugin;
