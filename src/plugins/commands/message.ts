/* eslint-disable @typescript-eslint/no-empty-function */
import {
  CacheType,
  CommandInteraction,
  DMChannel,
  Guild,
  Message,
  MessageEmbed,
  NewsChannel,
  TextChannel,
} from "discord.js";
import fetch from "node-fetch";
import { nanoid } from "nanoid";
import {
  CommandError,
  ICommandPluginClass,
  staticImplements,
} from "../../types/DissidiumPlugin";
import { SlashCommandBuilder } from "@discordjs/builders";
import { ChannelType } from "discord-api-types/v9";
import DatabasePlugin from "../database";
import fs from "fs/promises";
import { resolve } from "path";

const URLRegex =
  /((http|https):\/\/)(www.)?share\.discohook\.app\/go\/[a-zA-Z0-9@:%._\\+~#?&//=]{8,}/gm;
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

type MessageDB = {
  [id: string]: MessageDBInfo;
};

type MessageDBInfo = {
  id: string[12];
  lastEditedUserID: string;
  lastEditedDate: number;
};

interface MessageObject {
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
@staticImplements<ICommandPluginClass<[DatabasePlugin]>>()
export default class MessageCommand {
  static pluginName = "command-message";
  static dependencies = ["database"];

  commandName = "message";
  data = new SlashCommandBuilder()
    .setName("message")
    .setDescription("Allows to create bot messages for use in other modules.")
    .addSubcommand(subCommand =>
      subCommand
        .setName("editor")
        .setDescription("Lets you edit or create new bot messages.")
        .addStringOption(stringOption =>
          stringOption
            .setRequired(false)
            .setName("message-name")
            .setDescription(
              "If you want to edit an existing message, assign the name of the message to this field."
            )
        )
    )
    .addSubcommand(subCommand =>
      subCommand
        .setName("set")
        .setDescription(
          "Assigns the message from a (valid) editor URL to the given name."
        )
        .addStringOption(stringOption =>
          stringOption
            .setRequired(true)
            .setName("message-name")
            .setDescription(
              "Unique name used to refer to this message later. (Alphanumeric characters as well as `-` and `_`)"
            )
        )
        .addStringOption(stringOption =>
          stringOption
            .setRequired(true)
            .setName("discohook-url")
            .setDescription(
              `A valid short-link from discohook.org. Use \`/message editor\` to generate one.`
            )
        )
    )
    .addSubcommand(subCommand =>
      subCommand
        .setName("list")
        .setDescription(
          "Shows a list of all currently saved messages and when they were last modified."
        )
    )
    .addSubcommand(subCommand =>
      subCommand
        .setName("post")
        .setDescription("Sends a pre-saved message to a given text-channel.")
        .addStringOption(stringOption =>
          stringOption
            .setName("message-name")
            .setDescription(
              "The name of the message to post (Alphanumeric characters as well as `-` and `_`)"
            )
            .setRequired(true)
        )
        .addChannelOption(channelOption =>
          channelOption
            .addChannelType(ChannelType.GuildText)
            .setName("channel")
            .setDescription(
              "The text-channel to post this message to. (Default: This text-channel)"
            )
            .setRequired(false)
        )
    )
    .addSubcommand(subCommand =>
      subCommand
        .setName("remove")
        .setDescription("Removes a previously saved message")
        .addStringOption(stringOption =>
          stringOption
            .setName("message-name")
            .setDescription(
              "Unique name of the message you wish to remove (Alphanumeric characters as well as `-` and `_`)"
            )
            .setRequired(true)
        )
    );

  /**
   * Generates a discohook editor short-link.
   * If a messageName is given, the saved message's data will be included in the short-link.
   *
   * @param guild Guild class (usually retrieved from message.guild).
   * @param messageName Name of the saved message to edit
   */
  private generateEditorURL = async (
    guildId: Guild["id"],
    messageName?: string
  ): Promise<string> => {
    if (!messageName) return "https://discohook.org";

    const messageObj = await this.fetchMessageObject(guildId, messageName);
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
    const data = (await res.json()) as undefined | { url?: string };

    // Check for received data's integrity
    if (!data || data.url !== "string")
      throw new Error("Invalid response received from discohook.");

    return data.url;
  };

  /**
   * Retrieves the path to a messages savefile.
   *
   * @param id Message savefile identifier. If left empty, its directory is returned.
   */
  private getMessagePath = async (id = "") => {
    const dirPath = await this.db.getStorePath(this);
    return resolve(dirPath, id ? `./${id}.json` : "");
  };

  /**
   * Retrieves a messages metadata from the database
   *
   * @param guild The guild the message is associated to
   * @param messageName The unique identifier of the message
   * @returns A message metadata object
   */
  getMessageInfo = async (
    guildId: Guild["id"],
    messageName: string
  ): Promise<MessageDBInfo | undefined> => {
    if (messageName.match(nameCheckRegex)) throw new CommandError("Invalid message name");
    const guildData = await this.db.getGuildData<MessageDB>(guildId, "messages", {});
    const messageInfo = guildData[messageName];

    return messageInfo;
  };

  /**
   * Retrieves and parses a pre-saved message from the database.
   *
   * @param guild Guild class (usually retrieved from message.guild).
   * @param data Either an identifying message name or an already retrieved message info object.
   */
  fetchMessageObject = async (
    guildId: Guild["id"],
    data: string | MessageDBInfo
  ): Promise<MessageObject> => {
    const messageInfo =
      typeof data === "string" ? await this.getMessageInfo(guildId, data) : data;

    // Failsafe for bad messageInfo data
    if (!messageInfo || !messageInfo.id) throw new CommandError("Invalid message name");

    // Read message from JSON file
    const msgPath = await this.getMessagePath(messageInfo.id);
    const contents = await fs.readFile(msgPath, "utf-8");

    // Parse JSON
    const messageObj: MessageObject | undefined = JSON.parse(contents);
    if (!messageObj) throw new Error("Message couldn't be parsed.");

    return messageObj;
  };

  /**
   * Sends a pre-saved message to a given channel.
   *
   * @param guild The guild the message originates from.
   * @param channel The channel to send the message into.
   * @param messageName The identifying name of the pre-saved message.
   * @returns A Message object for further use.
   */
  sendMessage = async (
    guildId: Guild["id"],
    channel: TextChannel | DMChannel | NewsChannel,
    messageName: string
  ): Promise<Message> => {
    const messageData = await this.fetchMessageObject(guildId, messageName);
    const messageSent = await channel.send({
      content: messageData.content,
      embeds: messageData.embeds,
    });

    return messageSent;
  };

  /**
   * Executes each time a user uses the editor slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onEditorCommand = async (interaction: CommandInteraction<"present">) => {
    const messageName = interaction.options.getString("message-name", false) || "";
    const url = await this.generateEditorURL(interaction.guildId, messageName);

    await interaction.reply({
      ephemeral: true,
      embeds: [
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
            `You can apply your changes by using \`/editor set ${
              messageName || "<NAME>"
            } <SHORTLINK>\``,
          ].join("\n"),
          fields: [
            {
              name: "Editor:",
              value: url,
            },
          ],
        }),
      ],
    });
  };

  /**
   * Executes each time a user uses the set slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onSetCommand = async (interaction: CommandInteraction<"present">) => {
    const { guildId, createdTimestamp, user } = interaction;
    const messageName = interaction.options.getString("message-name", true);
    const shortLinkArray = interaction.options
      .getString("discohook-url", true)
      .match(URLRegex);

    if (messageName.match(nameCheckRegex))
      throw new CommandError(
        "Name may only contain alphanumeric characters as well as `-` and `_`."
      );

    if (!shortLinkArray)
      throw new CommandError(
        "The URL may only be a short-link from <https://discohook.org>. _(Hint: Use the `Share Message` button.)_"
      );

    // Use previous filename if message name already in database.
    const messageInfo = await this.getMessageInfo(guildId, messageName);
    const messageId: string[12] = messageInfo?.id ?? nanoid(12);

    // Message is stored in a plugin-specific directory
    const msgDir = await this.getMessagePath();
    const filePath = resolve(msgDir, `./${messageId}.json`);

    const res = await fetch(shortLinkArray[0]);
    const matcher = /(\?data=)(.*)/g.exec(res.url);
    if (!matcher) throw new CommandError("Invalid data received from Discohook", false);

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
      throw new CommandError("Could not parse data from Discohook", false);

    // Write JSON to dedicated message file
    await fs.writeFile(filePath, JSON.stringify(parsedData.messages[0].data), "utf-8");

    // Add new file to guild database by mutating the database
    const messageInfos = await this.db.getGuildData<MessageDB>(guildId, "messages", {});

    messageInfos[messageName] = {
      id: messageId,
      lastEditedDate: createdTimestamp,
      lastEditedUserID: user.id,
    };

    // Save changes to disk
    await this.db.save();

    // Reply with success message
    await interaction.reply(
      `✅ Successfully added message "${messageName}" to this server. You can post it with \`/message post ${messageName} [CHANNEL]\`.`
    );
  };

  /**
   * Executes each time a user uses the list slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onListCommand = async (interaction: CommandInteraction<"present">) => {
    const { guildId } = interaction;
    const messageInfos = await this.db.getGuildData<MessageDB>(guildId, "messages", {});

    // Fetch guild members to cache
    if (!interaction.guild) throw new CommandError("Could not load server info", false);

    const description: string[] = [];
    for (const mName in messageInfos) {
      const mInfo = messageInfos[mName];
      let username = "<User left this server>";
      try {
        const user = await interaction.guild.members.fetch(mInfo.lastEditedUserID);
        username = user.displayName;
      } catch (err) {
        console.log("User could not be retrieved: ", mInfo.lastEditedUserID);
      }

      description.push(
        `**${mName}** | Last edited by ${username} @ ${new Date(
          mInfo.lastEditedDate
        ).toLocaleString(interaction.locale)}`
      );
    }

    await interaction.reply({
      embeds: [
        new MessageEmbed({
          title: "List of saved bot messages",
          description:
            description.length > 0 ? description.join("\n") : "No messages saved yet.",
          footer:
            // Only send footer if there are no messages saved yet.
            description.length > 0
              ? {}
              : {
                  text: `👀 To add new messages, use /message editor`,
                },
        }),
      ],
    });
  };

  /**
   * Executes each time a user uses the post slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onPostCommand = async (interaction: CommandInteraction<"present">) => {
    const { guild, guildId, channelId } = interaction;
    const messageName = interaction.options.getString("message-name", true);
    const channelCandidateId =
      interaction.options.getChannel("channel", false)?.id ?? channelId;

    // Making sure guild is loaded in cache
    if (!guild)
      throw new CommandError(
        "Can't load guild-specific data. Please try again later.",
        false
      );

    // Validate user channel input
    const channel = await guild.channels.fetch(channelCandidateId);
    if (!channel)
      throw new CommandError("The given channel does not exist in this guild.");
    if (!channel.isText())
      throw new CommandError("The given channel is not a text-channel.");

    // Send message
    await this.sendMessage(guildId, channel, messageName);

    // Send confirmation to user
    // Send it privately, if the message is sent in the same channel the command was sent
    await interaction.reply({
      ephemeral: channel.id === interaction.channelId,
      content: `✅ Successfully posted message "${messageName}" to <#${channel.id}>!`,
    });
  };

  /**
   * Executes each time a user uses the remove slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onRemoveCommand = async (interaction: CommandInteraction<"present">) => {
    const { guildId } = interaction;
    const messageName = interaction.options.getString("message-name", true);

    // Get message info for file retrieval
    const messageInfo = await this.getMessageInfo(guildId, messageName);
    if (!messageInfo) throw new CommandError(`Message "${messageName}" was not found.`);

    // Remove message info from guild database by mutating the database
    const messageInfos = await this.db.getGuildData<MessageDB>(guildId, "messages", {});
    delete messageInfos[messageName];
    await this.db.save();

    // Remove message file
    const messagePath = await this.getMessagePath(messageInfo.id);
    await fs.unlink(messagePath);

    await interaction.reply(`✅ Successfully removed message "${messageName}"!`);
  };

  /**
   * Executes each time a user uses a slash command that refers to this class.
   *
   * @param interaction A live interaction object from Discord.js
   */
  onCommandInteraction = async (interaction: CommandInteraction<CacheType>) => {
    if (!interaction.inGuild())
      throw new CommandError("This command is only executable in guild text-channels.");

    const subcommand = interaction.options.getSubcommand(false);

    switch (subcommand) {
      case "editor":
        await this.onEditorCommand(interaction);
        break;

      case "set":
        await this.onSetCommand(interaction);
        break;

      case "list":
        await this.onListCommand(interaction);
        break;

      case "post":
        await this.onPostCommand(interaction);
        break;

      case "remove":
        await this.onRemoveCommand(interaction);
        break;

      default:
        throw new CommandError("Please use the available sub-commands.");
    }
  };

  constructor(private db: DatabasePlugin) {}

  start = async () => {};
  stop = async () => {};
}
