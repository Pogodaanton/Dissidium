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

// Setup shutdown system
async function shutdown(err?: Error) {
  if (err) console.error("Uncaught exception:", err);

  console.log("Shutting down...");
  await plugineer.destroy();
  client.destroy();
}

// When the client is ready, run this code (only once)
client.once("ready", async () => {
  await plugineer.loadPlugins();
  console.log("Ready!");

  process
    .on("SIGINT", shutdown)
    .on("SIGTERM", shutdown)
    .on("uncaughtException", shutdown);
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);
