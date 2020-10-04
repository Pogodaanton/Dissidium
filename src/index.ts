#!/usr/bin/env node
import DissidiumBot from "./bot";

const errHandler = <T>(err: T): void => {
  console.log("");
  console.log("----------------------");
  console.log("A fatal error occured!");
  console.log("----------------------");
  console.log("");
  console.error(err);
  console.log("----------------------");
  console.log("");
};

process.on("uncaughtException", errHandler);
process.on("unhandledRejection", errHandler);

// Create an instance of a Discord client
const bot = new DissidiumBot();
bot.setPluginFolder("./plugins");
bot.setPluginFolder("./plugins/commands", "commands");
bot.logIn();
