/* eslint-disable @typescript-eslint/no-explicit-any */
/*
import lowdb from "lowdb";
import FileAsync from "lowdb/adapters/FileAsync";
import Plugin from "../PluginStructs";
import { resolve } from "path";
import { Guild } from "discord.js";
import _ from "lodash";

const dbPath = resolve(__dirname, "../../db/db.json");

/*
db.defaults({ posts: [] })
  .write()

const result = db.get('posts')
  .push({ title: process.argv[2] })
  .write()

console.log(result)


interface GuildDB {
  bouncer?: {
    langRoles?: {
      [emoji: string]: string;
    };
  };
  masters?: string[];
}

/**
 * Handles database i/O
 *
export default class DatabaseMan extends Plugin {
  db: lowdb.LowdbAsync<any> | null = null;

  getDB = (): lowdb.LowdbAsync<any> | null => this.db;

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  getGuildDB = (guild: Guild | null): GuildDB | null => {
    if (!this.db || !guild) return null;
    const guildObj = this.db.get("guilds." + guild.id).value();

    if (typeof guildObj !== "object") return {};
    return guildObj;
  };

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  setGuildDB = (guild: Guild | null, obj: GuildDB): void => {
    if (!this.db || !guild) return;
    this.db.set("guilds." + guild.id, obj).write();
  };

  load = async (): Promise<void> => {
    const adapter = new FileAsync(dbPath);
    this.db = await lowdb(adapter);
  };

  unload = async (): Promise<void> => {
    this.db?.write();
  };
}

*/

import Plugin from "../utils/PluginStructs";
import { JsonDB } from "node-json-db";
import { Config } from "node-json-db/dist/lib/JsonDBConfig";
import { resolve } from "path";
import { Guild } from "discord.js";

const dbPath = resolve(__dirname, "../../db/db.json");
const dbConfig = new Config(dbPath, true, false, "/");

export default class DatabaseMan extends Plugin {
  db: JsonDB = new JsonDB(dbConfig);
  dbPath = dbPath;

  /**
   * Seperate guild checker for easier i18n support
   * later down the road.
   *
   * @memberof DatabaseMan
   */
  checkGuild = (guild: Guild | null): guild is Guild => {
    if (!guild) throw new Error("No Guild object given!");
    return true;
  };

  /**
   * Gets data from a specific guild
   *
   * @param guild The guild you want to look into
   * @param path The path to the data you want to access seperated with `/`
   * @memberof DatabaseMan
   */
  getGuildData = async <T>(guild: Guild | null, path: string): Promise<T | null> => {
    if (!this.checkGuild(guild)) return null;

    try {
      const data = this.db.getData(
        `/${guild.id}${path.startsWith("/") ? "" : "/"}${path}`
      );
      return data;
    } catch (err) {
      if (
        process.env["FORCEDEBUG"] === "1" ||
        (typeof err.message === "string" &&
          !(err.message as string).startsWith("Can't find dataPath"))
      ) {
        console.log("JSONDB -", err.name, "-", err.message);
      }
      return null;
    }
  };

  /**
   * Looks for a specified string in an array of a specific guild
   *
   * @param guild The guild you want to look into
   * @param path The path to the array you want to access seperated with `/`
   * @param needle The string that needs to be found in the array
   * @memberof DatabaseMan
   */
  getGuildDataIndex = async (
    guild: Guild | null,
    path: string,
    needle: string
  ): Promise<number> => {
    if (!this.checkGuild(guild)) return -1;
    return this.db.getIndex(
      `/${guild.id}${path.startsWith("/") ? "" : "/"}${path}`,
      needle
    );
  };

  /**
   * Sets data for specific guild.
   *
   * @param guild The guild you want to save into
   * @param path The path to the data you want to save sperated with `/`
   * @param data The data you want to save
   * @param override Whether the data should override any existing ones
   * @memberof DatabaseMan
   */
  setGuildData = async <T>(
    guild: Guild | null,
    path: string,
    data: T,
    override = false
  ): Promise<void> => {
    if (!this.checkGuild(guild)) return;
    return this.db.push(
      `/${guild.id}${path.startsWith("/") ? "" : "/"}${path}`,
      data,
      override
    );
  };

  /**
   * Removes data for specific guild.
   *
   * @param guild The guild you want to remove data in
   * @param path The path to the data you want to delete sperated with `/`
   * @param arrayNeedle The data you look for in an array you defined in `path`. If found, only the entry will be removed.
   * @memberof DatabaseMan
   */
  deleteGuildData = async <T>(
    guild: Guild | null,
    path: string,
    arrayNeedle?: T
  ): Promise<void> => {
    if (!this.checkGuild(guild)) return;
    const pathPrefix = `/${guild.id}${path.startsWith("/") ? "" : "/"}`;

    if (arrayNeedle) {
      const index = this.db.getIndex(pathPrefix + path, arrayNeedle + "");
      return this.db.delete(pathPrefix + path + "[" + index + "]");
    }

    return this.db.delete(pathPrefix + path);
  };

  load = (): void => {
    this.db.reload();
  };

  unload = (): void => {
    this.db.save();
  };
}
