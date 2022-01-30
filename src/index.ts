#!/usr/bin/env node
import { Client, Intents } from "discord.js";
import { initConfig } from "./utils/environmenter";
import Plugineer from "./utils/plugineer";

// Initialise config
const config = initConfig();

// Create a new discord.js client instance
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });

// Construct plugin manager
const plugineer = new Plugineer(client, config);

// When the client is ready, run this code (only once)
client.once("ready", async () => {
  await plugineer.loadPlugins();
  console.log("Ready!");
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);
