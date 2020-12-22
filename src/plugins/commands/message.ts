import { CommandPlugin, UsageArray } from "../../utils/PluginStructs";
import {
  DMChannel,
  Guild,
  Message,
  MessageEmbed,
  NewsChannel,
  TextChannel,
} from "discord.js";
import DatabaseMan from "../databaseMan";
import { findChannel, sendError } from "../../utils";
import path from "path";
import fs from "fs/promises";
import fetch from "node-fetch";
import { nanoid } from "nanoid";

const URLRegex = /((http|https):\/\/)(www.)?share\.discohook\.app\/go\/[a-zA-Z0-9@:%._\\+~#?&//=]{8,}/gm;
const nameCheckRegex = /[^A-Za-z0-9_-]/g;

/**
 * Swooped from Discohooks repository. It decodes the data in their URLs.
 *
 * @param urlSafeBase64 Base64 data to decode.
 * @see https://git.io/JL8OD
 */
const base64Decode = (urlSafeBase64: string) => {
  const base64 = urlSafeBase64.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
};

/**
 * Swooped from Discohooks repository.
 * It encodes stringified JSON to base64 and makes it URL friendly.
 *
 * @param utf8 Stringified JSON to encode.
 * @see https://git.io/JLirR
 */
const base64Encode = (utf8: string) => {
  const base64 = Buffer.from(utf8, "utf8").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
};

type MessageDBInfo = {
  id: string[12];
  lastEditedUserID: string;
  lastEditedDate: number;
};

export interface MessageObject {
  content: string;
  embeds?: {
    title: string;
    description: string;
    color: number;
    fields?: {
      name: string;
      value: string;
    }[];
  }[];
}

/**
 * A wizard to greet new users and help them in retrieving roles.
 */
export default class MessageMan extends CommandPlugin {
  command = "message";
  description = "Allows to create bot messages for use in other modules.";
  usage: UsageArray = [
    {
      keywords: ["edit", "editor"],
      example: "editor [NAME]",
      description: "Lets you edit or create new bot messages.",
      arguments: [
        {
          optional: true,
          name: "[NAME]",
          description:
            "• If you want to __add__ a new message, leave this field blank.\n" +
            "• If you want to __edit__ an existing one, assign the name of the message to this field.",
        },
      ],
    },
    {
      keywords: ["set"],
      example: "set <NAME> <URL>",
      description: "Assigns the message from a (valid) editor URL to the given name.",
      arguments: [
        {
          name: "<NAME>",
          description:
            "The identifier used to refer to this message. May only contain alphanumeric characters as well as `-` and `_`.",
        },
        {
          name: "<URL>",
          description: `A valid **short-link** from discohook.org. To learn more about generating said links, use \`${
            this.config.prefix + this.command
          } editor\`.`,
        },
      ],
    },
    {
      example: "list",
      description:
        "Shows a list of all currently saved messages and when they were last modified.",
    },
    {
      keywords: ["post"],
      example: "post <NAME> [CHANNEL]",
      description: "Sends a pre-saved message to a given text-channel.",
      arguments: [
        {
          name: "<NAME>",
          description:
            "The previously given identifier of the saved message. May only contain alphanumeric characters as well as `-` and `_`.",
        },
        {
          optional: true,
          name: "[CHANNEL]",
          description:
            "The text-channel to post this message to. If empty, the message will be posted in the channel this command has been executed in.",
        },
      ],
    },
    {
      keywords: ["remove", "rm", "del", "delete"],
      example: "remove <NAME>",
      description: "Removes a previously saved message",
      arguments: [
        {
          name: "<NAME>",
          description:
            "The previously given identifier of the saved message. May only contain alphanumeric characters as well as `-` and `_`.",
        },
      ],
    },
  ];

  static dependencies = ["databaseMan"];
  databaseMan: DatabaseMan | undefined = this.bot.plugins.get(
    "DatabaseMan"
  ) as DatabaseMan;

  private generateEditorURL = async (
    guild: Guild | null,
    messageName?: string
  ): Promise<string> => {
    if (messageName) {
      const messageObj = await this.getMessageObject(guild, messageName);
      const encodableData = JSON.stringify({ messages: [{ data: messageObj }] });

      // Encode nessage data
      const base64 = encodeURIComponent(base64Encode(encodableData));
      const url = "https://discohook.org/?data=" + base64;

      // Establish connection with shortlink generator
      const res = await fetch("https://share.discohook.app/create", {
        headers: {
          accept: "application/json",
          "accept-language": "hu,de-AT;q=0.9,de;q=0.8,en-US;q=0.7,en;q=0.6",
          "content-type": "application/json",
        },
        body: JSON.stringify({ url }),
        method: "POST",
      });
      const data: undefined | { url: string } = await res.json();
      if (!data) throw new Error("Invalid response received from discohook.");

      return data.url;
    }
    return "https://discohook.org/";
  };

  private getMessagesDirectory = (): string => {
    if (!this.databaseMan?.dbPath) throw new Error("Couldn't find save path...");
    return path.resolve(this.databaseMan?.dbPath, "../messages/");
  };

  getMessageInfo = async (
    guild: Guild | null,
    messageName: string
  ): Promise<MessageDBInfo> => {
    if (messageName.match(nameCheckRegex)) throw new Error("Invalid message name");
    const message =
      (await this.databaseMan?.getGuildData<MessageDBInfo>(
        guild,
        `messages/${messageName}`
      )) || null;
    if (!message) throw new Error("Message not found");

    return message;
  };

  /**
   * Retrieves and parses a pre-saved message from the database.
   *
   * @param guild Guild class (usually retrieved from message.guild).
   * @param data Either an identifying message name or an already retrieved message info object.
   */
  getMessageObject = async (
    guild: Guild | null,
    data: string | MessageDBInfo
  ): Promise<MessageObject> => {
    const messageInfo =
      typeof data === "string" ? await this.getMessageInfo(guild, data) : data;

    // Read message from JSON file
    const msgDir = this.getMessagesDirectory();
    const contents = await fs.readFile(
      path.resolve(msgDir, `./${messageInfo.id}.json`),
      "utf-8"
    );

    // Parse JSON
    const messageObj: MessageObject | undefined = JSON.parse(contents);
    if (!messageObj) throw new Error("Message couldn't be parsed.");

    return messageObj;
  };

  /**
   * Sends a pre-saved message to the given channel.
   *
   * @param guild The guild the message originates from.
   * @param channel The channel to send the message into.
   * @param messageName The identifying name of the pre-saved message.
   * @returns A Message object for further use.
   */
  sendMessage = async (
    guild: Guild | null,
    channel: TextChannel | DMChannel | NewsChannel,
    messageName: string
  ): Promise<Message> => {
    const messageData = await this.getMessageObject(guild, messageName);

    // Send message with no embeds
    if (!messageData.embeds) {
      return await channel.send(messageData.content);
    }

    // Send message with embeds
    // Note that bots may only post one embed pro message
    let lastSentMessage: Promise<Message> | undefined;
    for (let i = 0; i < messageData.embeds.length; i++) {
      lastSentMessage = channel.send(i === 0 ? messageData.content : "", {
        embed: messageData.embeds[i],
      });
    }

    if (typeof lastSentMessage === "undefined")
      throw new Error("Message sending unsuccessful...");

    return await lastSentMessage;
  };

  executeEditor = async (msg: Message, args: string[]): Promise<void> => {
    try {
      const messageName = args[0] || "";
      const url = await this.generateEditorURL(msg.guild, messageName);

      msg.channel.send(
        new MessageEmbed({
          title:
            ":pencil: " +
            (messageName
              ? "How to edit the bot message"
              : "How to create a new bot message"),
          description: [
            "You can access the editor through the URL below.",
            "",
            "Do _not_ populate the following fields, as they won't work:",
            "`Webhook URL`, `Message Link`, `Files`",
            "",
            "After you've finished, locate the `Share Message` button and generate a short-link.",
            `You can apply your changes by using \`${
              this.config.prefix + this.command
            } set ${messageName || "<NAME>"} <SHORTLINK>\``,
          ].join("\n"),
          fields: [
            {
              name: "Editor:",
              value: url,
            },
          ],
        })
      );
    } catch (err) {
      sendError(msg, err, 8);
    }
  };

  executeSet = async (msg: Message, args: string[]): Promise<void> => {
    const { guild, author, createdTimestamp } = msg;
    if (!this.databaseMan?.dbPath) return sendError(msg, "Couldn't find save path...");
    const msgDir = path.resolve(this.databaseMan?.dbPath, "../messages/");

    if (args.length < 2 || !args[0] || !args[1])
      return sendError(msg, "You need to specify a message name and a valid short-link.");
    const messageName = args[0];
    const shortLinkArray = args[1].match(URLRegex);

    if (messageName.match(nameCheckRegex))
      return sendError(
        msg,
        "Name may only contain alphanumeric characters as well as `-` and `_`."
      );

    if (!shortLinkArray)
      return sendError(
        msg,
        "The URL may only be a short-link from Discohook.\n_Hint: Use the `Share Message` button._"
      );

    try {
      await fs.mkdir(msgDir, { recursive: true });
    } catch (err) {
      if (err.code != "EEXIST") return sendError(msg, err);
    }

    // Use previous filename if message name already in database.
    let uid: string[12];
    try {
      const messageObj = await this.getMessageInfo(guild, messageName);
      uid = messageObj.id;
    } catch (err) {
      uid = nanoid(12);
    }

    const filePath = path.resolve(msgDir, `./${uid}.json`);

    try {
      const res = await fetch(shortLinkArray[0]);
      const matcher = /(\?data=)(.*)/g.exec(res.url);
      if (!matcher) throw new Error("Invalid data from Discohook.");

      // Decode base64 to JSON
      const decodedData = base64Decode(decodeURIComponent(matcher[2]));
      const parsedData:
        | {
            messages: {
              data: MessageObject;
            }[];
          }
        | undefined = JSON.parse(decodedData);

      if (!parsedData || parsedData.messages.length < 1)
        throw new Error("Could not parse data from Discohook.");

      await fs.writeFile(filePath, JSON.stringify(parsedData.messages[0].data), "utf-8");

      /**
       * Add new file to guild database
       */
      await this.databaseMan?.setGuildData(guild, `messages/${messageName}`, {
        id: uid,
        lastEditedDate: createdTimestamp,
        lastEditedUserID: author.id,
      } as MessageDBInfo);
    } catch (err) {
      return sendError(msg, err);
    }

    msg.react("✅");
  };

  executeList = async (message: Message): Promise<void> => {
    const messages =
      (await this.databaseMan?.getGuildData<{
        [name: string]: MessageDBInfo;
      }>(message.guild, "messages")) || {};

    const description: string[] = Object.entries(messages).map(([name, obj]) => {
      const username =
        message.guild?.member(obj.lastEditedUserID)?.user.username ||
        "<User left this server>";

      return `**${name}** | Last edited by ${username} @ ${new Date(
        obj.lastEditedDate
      ).toLocaleString(message.author.locale)}`;
    });

    message.channel.send(
      new MessageEmbed({
        title: "List of saved bot messages",
        description:
          description.length > 0 ? description.join("\n") : "No messages saved yet.",
        footer:
          // Only send footer if there are no messages saved yet.
          description.length > 0
            ? {}
            : {
                text: `👀 To add new messages, use ${
                  this.config.prefix + this.command
                } editor`,
              },
      })
    );
  };

  executePost = async (
    message: Message,
    args: string[],
    getHelp: (args: string[]) => void
  ): Promise<void> => {
    if (args.length < 1) return getHelp(["post"]);

    // Initial variables
    const { guild } = message;
    const messageName = args[0];
    const channelName = args[1] || "";
    let proposedChannel = message.channel;

    try {
      // Get the channel to send in
      if (channelName) proposedChannel = findChannel(guild, channelName);
      // Retrieve and send message
      await this.sendMessage(guild, proposedChannel, messageName);
    } catch (err) {
      return sendError(message, err, 8);
    }
  };

  executeRemove = async (message: Message, args: string[]): Promise<void> => {
    try {
      if (args.length < 1) throw new Error("Please define a message to remove.");

      const { guild } = message;
      const messageName = args[0];
      const messageInfo = await this.getMessageInfo(guild, messageName);
      const messageDirectory = this.getMessagesDirectory();

      await this.databaseMan?.deleteGuildData(guild, `messages/${messageName}`);
      await fs.unlink(path.resolve(messageDirectory, `./${messageInfo.id}.json`));

      message.react("✅");
    } catch (err) {
      sendError(message, err, 8);
    }
  };

  execute = (
    message: Message,
    args: string[],
    getHelp: (args?: string[]) => void
  ): void => {
    switch (args.shift()) {
      case "edit":
      case "editor":
        this.executeEditor(message, args);
        break;

      case "set":
        this.executeSet(message, args);
        break;

      case "list":
        this.executeList(message);
        break;

      case "post":
        this.executePost(message, args, getHelp);
        break;

      case "rm":
      case "del":
      case "delete":
      case "remove":
        this.executeRemove(message, args);
        break;

      default:
        getHelp();
        break;
    }
  };

  load = (): void => {
    this.registerCommand();
  };
}
