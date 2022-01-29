import { SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, CacheType } from "discord.js";

interface CommandPlugin {
  data: SlashCommandBuilder;
  execute(interaction: CommandInteraction<CacheType>): Promise<void>;
}
