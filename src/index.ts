#!/usr/bin/env node
import { Client, GatewayIntentBits } from "discord.js";
import { initConfig } from "./utils/environmenter";
import Plugineer from "./utils/plugineer";

// Initialise config
const config = initConfig();

// Create a new discord.js client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Construct plugin manager
const plugineer = new Plugineer(client, config);

// Catch and print stack of all errors before panicking
async function handleUncaughtError(err?: Error) {
  if (err) {
    console.error("Uncaught exception:", err);
  }

  await shutdown();
}

// For user inputs like SIGINT and SIGTERM
async function handleShutdownRequest(type: string) {
  console.error(`\n${type} received...`);
  await shutdown();
}

// Setup general shutdown system
async function shutdown() {
  console.log("Shutting down...");
  await plugineer.destroy();
  client.destroy();
  console.log("Successful shutdown. Goodbye!\n");
}

// When the client is ready, run this code (only once)
client.once("ready", async () => {
  await plugineer.loadPlugins();
  console.log("Ready!");

  process
    .on("SIGINT", handleShutdownRequest)
    .on("SIGTERM", handleShutdownRequest)
    .on("uncaughtException", handleUncaughtError);
});

// Login to Discord with your client's token
client.login(process.env.TOKEN);
