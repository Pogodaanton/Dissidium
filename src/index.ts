#!/usr/bin/env node
import { Client, Intents } from "discord.js";
import deployCommands from "./utils/deploy-commands";
import { initConfig } from "./utils/environmenter";

// Initialise config
initConfig();

// Create a new client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

// When the client is ready, run this code (only once)
client.once("ready", () => {
  deployCommands();
  console.log("Ready!");
});

// Obvious copy-paste code.
client.on("interactionCreate", async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === "ping") {
    await interaction.reply("Pong!");
  } else if (commandName === "server") {
    await interaction.reply(
      `Server name: ${interaction.guild?.name}\nTotal members: ${interaction.guild?.memberCount}`
    );
  } else if (commandName === "user") {
    await interaction.reply(
      `Your tag: ${interaction.user.tag}\nYour id: ${interaction.user.id}`
    );
  }
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);
