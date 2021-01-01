/* eslint-disable @typescript-eslint/no-explicit-any */
import Plugin from "../utils/PluginStructs";
import { JsonDB } from "node-json-db";
import { Config } from "node-json-db/dist/lib/JsonDBConfig";
import { resolve } from "path";
import { Guild } from "discord.js";

const dbPath = resolve(__dirname, "../../db/db.json");
const dbConfig = new Config(dbPath, true, false, "/");

export type GuildOrGuildID = Guild | string | null;

export default class DatabaseMan extends Plugin {
  db: JsonDB = new JsonDB(dbConfig);
  dbPath = dbPath;

  /**
   * Seperate guild checker for easier i18n support
   * later down the road.
   *
   * @memberof DatabaseMan
   */
  private checkGuild = (guild: Guild | string | null): guild is Guild | string => {
    if (!guild) throw new Error("DatabaseMan only works in guilds!");
    return true;
  };

  /**
   * Retrieves the guild id from your input
   * @param guild The guild you need the ID of
   */
  private getGuildID = (guild: Guild | string): string =>
    typeof guild === "string" ? guild : guild.id;

  /**
   * Gets data from a specific guild
   *
   * @param guild The guild you want to look into
   * @param path The path to the data you want to access seperated with `/`
   * @memberof DatabaseMan
   */
  getGuildData = async <T>(guild: GuildOrGuildID, path: string): Promise<T | null> => {
    if (!this.checkGuild(guild)) return null;

    try {
      const data = this.db.getData(
        `/${this.getGuildID(guild)}${path.startsWith("/") ? "" : "/"}${path}`
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
   * @param needleKey Use this parameter if the needle is inside of an object. It will specify which object key to look for.
   * @memberof DatabaseMan
   */
  getGuildDataIndex = async (
    guild: GuildOrGuildID,
    path: string,
    needle: string,
    needleKey?: string
  ): Promise<number> => {
    if (!this.checkGuild(guild)) return -1;
    return this.db.getIndex(
      `/${this.getGuildID(guild)}${path.startsWith("/") ? "" : "/"}${path}`,
      needle,
      needleKey
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
    guild: GuildOrGuildID,
    path: string,
    data: T,
    override = false
  ): Promise<void> => {
    if (!this.checkGuild(guild)) return;
    return this.db.push(
      `/${this.getGuildID(guild)}${path.startsWith("/") ? "" : "/"}${path}`,
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
   * @param arrayNeedleKey Use this parameter if the needle is inside of an object. It will specify which object key to look for.
   * @memberof DatabaseMan
   */
  deleteGuildData = async <T>(
    guild: GuildOrGuildID,
    path: string,
    arrayNeedle?: T,
    arrayNeedleKey?: string
  ): Promise<void> => {
    if (!this.checkGuild(guild)) return;
    const pathPrefix = `/${this.getGuildID(guild)}${path.startsWith("/") ? "" : "/"}`;

    if (arrayNeedle) {
      const index = this.db.getIndex(pathPrefix + path, arrayNeedle + "", arrayNeedleKey);
      return this.db.delete(pathPrefix + path + "[" + index + "]");
    }

    return this.db.delete(pathPrefix + path);
  };

  /**
   * Retrieves the id of every guild the bot has ever interacted with.
   * @returns Promise<string[]>
   */
  getAllGuildIDs = async (): Promise<string[]> => {
    const obj = (await this.db.getData("/")) as { [guildID: string]: any };
    if (!obj) return [];

    return Object.keys(obj);
  };

  /**
   * Retrieves the guilds the bot has interacted with at least once.
   * Note that guilds with no corresponding Guild class will not be included in the returned array.
   *
   * @returns Promise<Guild[]>
   */
  getAllGuilds = async (): Promise<Guild[]> => {
    const guildIDs = await this.getAllGuildIDs();
    const guilds: Guild[] = [];
    guildIDs.forEach(async id => {
      try {
        const guild = await this.client.guilds.fetch(id);
        if (!guild) return;
        guilds.push(guild);
      } catch (err) {
        console.error("[Guild retrieval failed]", err);
        return;
      }
    });

    return guilds;
  };

  load = (): void => {
    this.db.reload();
  };

  unload = (): void => {
    this.db.save();
  };
}
