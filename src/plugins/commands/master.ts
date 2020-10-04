import { sendError } from "./../../utils/index";
import { CommandPlugin } from "../../utils/PluginStructs";
import { Guild, Message, MessageEmbed } from "discord.js";
import { CommandArguments } from "../commandMan";
import DatabaseMan from "../databaseMan";

/**
 * Manager command for assigning server command masters
 */
export default class Master extends CommandPlugin {
  command = "master";
  aliases = ["op"];
  description = "Assign dedicated users for the management of the bot.";

  args = ["{add|remove|list}", "USERNAME#DISCRIMINATOR"];
  usage = ["master {add|remove} USERNAME#DISCRIMINATOR", "master {list}"];

  static dependencies = ["databaseMan"];
  databaseMan: DatabaseMan | undefined = this.bot.plugins.get(
    "DatabaseMan"
  ) as DatabaseMan;

  /**
   * Get user in a guild by username
   */
  getUser = (guild: Guild, username: string): string => {
    if (!username.includes("#"))
      throw new Error("Invalid username format. e.g. USERNAME#DISCRIMINATOR");

    const discriminatorPos = username.lastIndexOf("#");
    const name = username.slice(0, discriminatorPos);
    const discriminator = username.slice(discriminatorPos + 1);

    const requestedUser = guild.members.cache.find(
      member =>
        member.user.username === name &&
        member.user.discriminator === discriminator &&
        !member.user.bot
    );

    if (!requestedUser) throw new Error("User was not found.");
    return requestedUser.user.id;
  };

  addMaster = async (msg: Message, args: string[]): Promise<void> => {
    const { guild } = msg;
    if (!guild) return;

    try {
      const userID = this.getUser(guild, args[0]);
      await this.databaseMan?.setGuildData(guild, "masters[]", userID);
      msg.react("✅");
    } catch (err) {
      sendError(msg, err);
    }
  };

  deleteMaster = async (msg: Message, args: string[]): Promise<void> => {
    const { guild } = msg;
    if (!guild) return;

    try {
      const userID = this.getUser(guild, args[0]);
      await this.databaseMan?.deleteGuildData(guild, "masters", userID);
      msg.react("✅");
    } catch (err) {
      sendError(msg, err);
    }
  };

  listMasters = async (msg: Message): Promise<void> => {
    const { guild } = msg;
    if (!guild) return;

    let masters =
      (await this.databaseMan?.getGuildData<string[]>(guild, "masters")) || [];
    masters = masters.map(
      id => "- " + (guild.member(id)?.user.username || "<User left this server>")
    );

    msg.channel.send(
      new MessageEmbed({
        title: "List of bot masters",
        description: masters.length > 0 ? masters.join("\n") : "No bot masters assigned.",
        footer: {
          text: "Note: All administrators are bot masters",
        },
      })
    );
  };

  execute = async (msg: Message, args: CommandArguments): Promise<void> => {
    const argList = args.getArgs();
    switch (argList.shift()) {
      case "add":
        return this.addMaster(msg, argList);
      case "remove":
        return this.deleteMaster(msg, argList);
      case "list":
        return this.listMasters(msg);
      default:
        return;
    }
  };
}
