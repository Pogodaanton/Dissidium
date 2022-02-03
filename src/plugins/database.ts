/* eslint-disable @typescript-eslint/no-empty-function */
import { Snowflake } from "discord-api-types";
import { Low, JSONFile } from "lowdb";
import {
  staticImplements,
  IDissidiumPluginClass,
  DissidiumPlugin,
} from "../types/DissidiumPlugin";
import fs from "fs/promises";
import { join } from "path";
import { Guild } from "discord.js";

export type Database = {
  globals: {
    [key: string]: unknown;
  };
  guilds: {
    [key: Snowflake]: {
      [key: string]: unknown;
    };
  };
};

@staticImplements<IDissidiumPluginClass>()
export default class DatabasePlugin {
  static pluginName = "database";
  static dependencies = [];

  constructor() {}

  /**
   * The main database object to read off of.
   *
   * We do enforced type assertion, as it's more elegant that way
   * and because we can clearly say that
   * if the database object is accessed while it doesn't exist,
   * the code shouldn't be run in the first place.
   */
  private db!: Low<Database>;

  /**
   * Main directory to put all database related content in
   */
  private databaseDir = new URL("database/", import.meta.url).pathname;

  /**
   * Requests a storage directory which the given plugin can use for writing data to.
   *
   * @param caller THe plugin to get the store path for
   * @returns A path string to a directory
   */
  getStorePath = async (caller: DissidiumPlugin) => {
    const { pluginName } = caller.constructor as IDissidiumPluginClass;
    const pluginDirPath = join(this.databaseDir, pluginName + "/");

    await fs.mkdir(pluginDirPath, { recursive: true });
    return pluginDirPath;
  };

  /**
   * Retrieves some data from a specific guild
   *
   * @param guild The guild you want to look into
   * @param key The key string the data is paired with
   * @param defaultValue
   */
  getGuildData = async <T>(
    guildId: Guild["id"],
    key: string,
    defaultValue: T
  ): Promise<T> => {
    if (!this.db.data) throw new Error("Database unavailable");

    if (typeof this.db.data.guilds[guildId] === "undefined") {
      this.db.data.guilds[guildId] = {};
      await this.db.write();
    }

    if (typeof this.db.data.guilds[guildId][key] === "undefined") {
      this.db.data.guilds[guildId][key] = defaultValue;
      await this.db.write();
    }

    return this.db.data.guilds[guildId][key] as T;
  };

  /**
   * Retrieve the IDs of all guilds the bot has data saved in.
   * @returns An array of guild IDs
   */
  getRelevantGuilds = () => {
    if (!this.db.data) throw new Error("Database unavailable");
    return Object.keys(this.db.data.guilds);
  };

  /**
   * Saves local database to disk
   */
  save = async () => await this.db.write();

  start = async () => {
    // Prepare database folder
    await fs.mkdir(this.databaseDir, { recursive: true });

    // Use JSON file for storage
    const dbFileName = join(this.databaseDir, "main.json");
    const jsonAdapter = new JSONFile<Database>(dbFileName);
    this.db = new Low<Database>(jsonAdapter);

    // Read data from JSON file, this will set db.data content
    await this.db.read();

    // Set default data
    this.db.data ||= { globals: {}, guilds: {} };

    // Write db.data content to db.json
    await this.db.write();
  };

  stop = async () => {};
}
