import getConfig from "./utils/configChecker";
import Discord from "discord.js";
import fs from "fs";
import { join } from "path";
import Plugin, { CommandPlugin } from "./utils/PluginStructs";

export default class Dissidium {
  private isLoggedIn = false;

  config = getConfig();
  client = new Discord.Client();

  pluginPaths = new Discord.Collection<string, string>();
  commands = new Discord.Collection<string, CommandPlugin>();
  plugins = new Discord.Collection<string, Plugin>();

  constructor() {
    this.client.on("ready", () => {
      console.log("Woke.");
    });

    process.once("SIGINT", async () => {
      console.log("Shutting down...");
      await this.cleanUp();
      await this.client.user?.setStatus("invisible");

      process.exit();
    });
  }

  initPlugin = (path: string): void => {
    if (this.isLoggedIn) {
      console.error("Invalid plugin import: Add plugins before login!");
      return;
    }

    // Duplicate checker
    if (require.cache[require.resolve(path)]) {
      if (process.env["FORCEDEBUG"] === "1")
        console.log("Skipping plugin: Has already been loaded...");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PluginObj: typeof Plugin = require(path).default;

    // Instance checker
    if (!(PluginObj.prototype instanceof Plugin)) {
      console.error(
        (PluginObj.name ?? "") +
          " - Invalid plugin: Exported object must be an instance of Plugin!"
      );
      return;
    }

    // Dependency resolver
    if (PluginObj.dependencies.length) {
      let dirPath = join(path, "../");

      if (
        PluginObj.prototype instanceof CommandPlugin &&
        typeof this.pluginPaths.get("default") !== "undefined"
      ) {
        // We check for it in the if clause
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        dirPath = join(__dirname, this.pluginPaths.get("default")!);
      }

      PluginObj.dependencies.forEach(val => this.initPlugin(join(dirPath, val)));
    }

    try {
      const plugin = new PluginObj(this);
      this.plugins.set(PluginObj.name, plugin);
      plugin.load();
    } catch (err) {
      console.error(PluginObj.name + " - Error while initiating plugin:", err);
    }
  };

  /**
   * Initiates every plugin inside of a specified folder
   * @param path Path of the directory relative to bot.ts
   * @param type Type of the plugins the directory contains. Use this if you want to import from multiple directories.
   */
  setPluginFolder = (path: string, type = "default"): void => {
    fs.readdirSync(join(__dirname, path)).forEach(fileName => {
      if (!fileName.match(/\.(js|ts)/)) return;
      this.initPlugin(join(__dirname, path, fileName));
    });

    //
    if (this.pluginPaths.get(type)) {
      throw new Error(
        "Plugin path for type " +
          type +
          " is already defined. Please define the type of plugins being loaded if you want to load assets from another directory."
      );
    }

    this.pluginPaths.set(type, path);
  };

  logIn = (): void => {
    if (this.isLoggedIn) {
      console.error("Invalid login request: Dissidium is already logged in!");
      return;
    }

    this.client.login(this.config.token);
    this.isLoggedIn = true;
  };

  /**
   * Seperate function for error handling
   */
  unloadPlugin = async (p: Plugin): Promise<void> => {
    try {
      await p.unload();
    } catch (err) {
      console.error("Error while unloading a plugin:", err);
    }
  };

  cleanUp = async (): Promise<void> => {
    for (const plugin of this.plugins.array()) {
      this.unloadPlugin(plugin);
    }
  };
}
