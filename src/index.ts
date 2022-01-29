#!/usr/bin/env node
import { Client, Collection, Intents } from "discord.js";
import deployCommands from "./utils/deploy-commands";
import { commandDirPath, getCommandFiles } from "./utils/deploy-commands";
import { initConfig } from "./utils/environmenter";
import { CommandPlugin } from "./types/DissidiumPlugin";

// Initialise config
initConfig();

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

// Commands registry
const commands = new Collection<string, CommandPlugin>();

async function fetchCommands() {
  const commandFiles = await getCommandFiles();

  commandFiles.forEach(async file => {
    const {
      default: { default: command },
    } = await import(`${commandDirPath}${file}`);

    // Set a new item in the Collection
    // With the key as the command name and the value as the exported module
    commands.set(command.data.name, command);
  });
}

// When the client is ready, run this code (only once)
client.once("ready", async () => {
  fetchCommands();
  deployCommands();
  console.log("Ready!");
});

// Obvious copy-paste code.
client.on("interactionCreate", async interaction => {
  if (!interaction.isCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({
      content: "There was an error while executing this command!",
      ephemeral: true,
    });
  }
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);
