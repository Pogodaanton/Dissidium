import { CommandPlugin, UsageArray } from "../../utils/PluginStructs";
import {
  Client,
  Collection,
  Guild,
  GuildMember,
  Message,
  MessageEmbed,
  MessageReaction,
  PartialUser,
  TextChannel,
  User,
} from "discord.js";
import DatabaseMan, { GuildOrGuildID } from "../databaseMan";
import {
  alphaNumericRegex,
  findChannel,
  findRole,
  isTextChannel,
  sendError,
} from "../../utils";
import MessageMan from "./message";
import emojiRegex from "emoji-regex";

interface MessagePosData {
  channelID: string;
  messageIDs: string[];
}

interface ReactionPair {
  emoji: string;
  role: string;
}

interface ReactRoleConfig {
  /**
   * The pre-saved message to use when posting into a channel.
   */
  templateName: string;
  /**
   * Reactions to observe
   */
  reactions: ReactionPair[];
  /**
   * Messages to observe. Populated by `!reactrole channel set`.
   * We mainly care about the last message, since that is the one with the reactions.
   */
  observables: MessagePosData;
}

export class ReactRoleChainListener {
  client: Client;
  guild: Guild;
  channelID: string;
  configs: ReactRoleConfig[] = [];
  cooldown = 1;

  // Cache
  assignableRoles: string[] = [];
  msgMap = new Collection<string, number>();
  userRoleProposals: {
    [userID: string]: {
      [configIndex: number]: string;
    };
  } = {};
  userCooldowns: {
    [userID: string]: NodeJS.Timeout;
  } = {};
  protectedUsers: string[] = [];

  private getMember = async (user: PartialUser["id"]): Promise<GuildMember | null> => {
    try {
      const member = await this.guild.members.fetch({ user });
      return member;
    } catch (err) {
      console.error(
        `[${Date.now().toLocaleString()}] Unhandled member promotion due to fetch error: \n`,
        err
      );
      return null;
    }
  };

  private verifyRoleAssignment = async (userID: PartialUser["id"]): Promise<void> => {
    const userChoices = this.userRoleProposals[userID];
    const userRoleChoices = Object.values(userChoices);

    if (
      userRoleChoices.length !== this.configs.length ||
      userRoleChoices.some(role => !role)
    )
      return;

    // Fetch member
    const member = await this.getMember(userID);
    if (!member) return;

    // Keep an array of roles this class has nothing to do with
    const memberRoles = Array.from(member.roles.cache.keys());
    const interferingRoles = memberRoles.filter(
      roleID => !this.assignableRoles.includes(roleID)
    );

    // Combine new role choices with the ones we do not care about
    await member.roles.set([...interferingRoles, ...userRoleChoices]);
  };

  private verifyRoleRemovement = async (
    member: GuildMember,
    roleID: ReactionPair["role"]
  ): Promise<void> => {
    // Array with roles except the one that has already been removed
    const adjustedRoleIDs = this.assignableRoles.filter(role => role !== roleID);
    if (adjustedRoleIDs.length <= 0) return;

    await member.roles.remove(adjustedRoleIDs);
  };

  private formatReactionData = async (reaction: MessageReaction): Promise<number> => {
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (err) {
        console.error(
          `[${Date.now().toLocaleString()}] Unhandled reaction due to fetch error: \n`,
          err
        );
        return -1;
      }
    }

    if (reaction.me) return -1;

    const configIndex = this.msgMap.get(reaction.message.id);
    if (
      typeof configIndex !== "number" ||
      reaction.message.channel.id !== this.channelID
    ) {
      return -1;
    }

    return configIndex;
  };

  /*
  private fetchUserReactions = async (userID: PartialUser["id"]): Promise<void> => {
    const messages = this.msgMap.keyArray();
    for (const messageID of messages) {
      try {
        const configIndex = this.msgMap.get(messageID);
        if (!configIndex) continue;
        const config = this.configs[configIndex];
        if (!config) continue;

        const channel = this.guild.channels.cache.get(
          config.observables.channelID
        ) as TextChannel;
        if (!channel || channel.type !== "text") continue;
        const message = await channel.messages.fetch(messageID);
        if (!message) continue;

        const existingReaction = message.reactions.cache.find(reaction => {
          return (
            reaction.users.cache.has(userID) &&
            config.reactions.some(pair => pair.emoji === reaction.emoji.name)
          );
        });
        if (!existingReaction) continue;
        const reactionPair = config.reactions.find(
          pair => pair.emoji === existingReaction.emoji.name
        );
        if (!reactionPair) continue;

        this.userRoleProposals[userID][configIndex] = reactionPair.role;
      } catch (err) {
        console.error("[prepareUserRoleProposal]", err);
        continue;
      }
    }
  };
  */

  private prepareUserRoleProposal = async (userID: PartialUser["id"]): Promise<void> => {
    if (!this.userRoleProposals[userID]) this.userRoleProposals[userID] = {};
  };

  private keepOneUserReaction = async (
    primaryReaction: MessageReaction,
    user: User | PartialUser
  ): Promise<void> => {
    primaryReaction.message.reactions.cache.forEach(async reaction => {
      if (reaction.emoji.name === primaryReaction.emoji.name) return;
      if (reaction.users.cache.get(user.id)) {
        this.protectedUsers.push(user.id);
        await reaction.users.remove(user.id);
      }
    });
  };

  private setUserCooldown = (
    userID: PartialUser["id"],
    timeoutFunc: VoidFunction
  ): void => {
    // Clear old timeout
    const timeout = this.userCooldowns[userID];
    if (timeout) clearTimeout(timeout);
    // Add new timeout
    this.userCooldowns[userID] = setTimeout(timeoutFunc, this.cooldown * 1000);
  };

  private reactionAddListener = async (
    reaction: MessageReaction,
    user: User | PartialUser
  ): Promise<void> => {
    // Check for reaction eligibility and retrieve config index
    const configIndex = await this.formatReactionData(reaction);
    if (configIndex < 0) return;

    // Retrieve config
    const config = this.configs[configIndex];
    const reactionPair = config.reactions.find(
      pair => pair.emoji === reaction.emoji.name
    );
    if (!reactionPair) return;

    // Update role proposal list
    await this.prepareUserRoleProposal(user.id);
    this.userRoleProposals[user.id][configIndex] = reactionPair.role;

    // Reset timeout
    this.setUserCooldown(user.id, async () => await this.verifyRoleAssignment(user.id));

    // Remove other reactions from user
    await this.keepOneUserReaction(reaction, user);
  };

  private reactionRemoveListener = async (
    reaction: MessageReaction,
    user: User | PartialUser
  ): Promise<void> => {
    // Check for reaction eligibility and retrieve config index
    const configIndex = await this.formatReactionData(reaction);
    if (configIndex < 0) return;

    // Retrieve config
    const config = this.configs[configIndex];
    const reactionPair = config.reactions.find(
      pair => pair.emoji === reaction.emoji.name
    );
    if (!reactionPair) return;

    // Remove role paired with this reaction
    try {
      const member = await this.getMember(user.id);
      if (!member) return console.warn("User <" + user.id + "> does not exist!");

      // Check for non-manual reaction removal
      const index = this.protectedUsers.findIndex(id => user.id === id);
      if (index >= 0) {
        this.protectedUsers.splice(index, 1);
        return;
      }

      await this.prepareUserRoleProposal(user.id);
      delete this.userRoleProposals[user.id][configIndex];

      // Set timeout for possible removal of rest of roles
      this.setUserCooldown(
        user.id,
        async () => await this.verifyRoleRemovement(member, "")
      );
    } catch (err) {
      console.error("Unexpected error during role removal: ", err);
    }
  };

  constructor(client: Client, guild: Guild | null, config: ReactRoleConfig) {
    this.client = client;
    this.configs.push(config);
    this.channelID = config.observables.channelID;
    this.regenerateIndexingCache();

    if (!guild) throw new Error("Reactrole only works on servers.");
    this.guild = guild;

    // Start listeners
    this.client.on("messageReactionAdd", this.reactionAddListener);
    this.client.on("messageReactionRemove", this.reactionRemoveListener);
  }

  public addConfig = (config: ReactRoleConfig): void => {
    this.configs.push(config);
    this.regenerateIndexingCache();
  };

  public unload = (): void => {
    this.client.off("messageReactionAdd", this.reactionAddListener);
    this.client.off("messageReactionRemove", this.reactionRemoveListener);
  };

  private regenerateIndexingCache = () => {
    this.assignableRoles.splice(0, this.assignableRoles.length);
    this.msgMap.clear();
    this.configs.forEach((config, index) => {
      config.observables.messageIDs.forEach(messageID => {
        this.msgMap.set(messageID, index);
      });
      config.reactions.forEach(reactObj => {
        this.assignableRoles.push(reactObj.role);
      });
    });
  };
}

/**
 * A script for assigning roles to users depending on which emoji they react with on a text-message.
 */
export default class ReactRole extends CommandPlugin {
  command = "reactrole";
  description =
    "Assign roles based on which emoji users react with on a specific message. Link multiple configs to create co-dependent reaction chains.";
  usage: UsageArray = [
    {
      example: "add <NAME> [TEMPLATE-NAME]",
      description: "Creates a new reactrole config.",
      keywords: ["add", "new", "create"],
      arguments: [
        {
          name: "<NAME>",
          description: "A unique identifying name for the new reactrole configuration.",
        },
        {
          optional: true,
          name: "[TEMPLATE NAME]",
          description: `The name of a pre-prepared bot message. You can create one by following the instructions at \`${this.config.prefix}message editor\`.`,
        },
      ],
    },
    {
      example: "remove <NAME>",
      description:
        "Removes a reactrole config and deletes any active message along with it.",
    },
    {
      example: "channel {set|remove} <CONFIG-NAME> <CHANNEL-NAME>",
      description: "Define which channel to post the reactrole message into.",
      keywords: ["channel", "channel set", "channel remove"],
      arguments: [
        {
          name: "<CONFIG-NAME>",
          description: "A valid name of an existing reactrole configuration.",
        },
        {
          name: "<CHANNEL-NAME>",
          description: "The name of an existing text-channel in your guild.",
        },
      ],
    },
    {
      example: "list",
      description: "List all available configs and their relations.",
    },
    {
      example: "list [CONFIG NAME]",
      description: "See each customized property of a given config.",
    },
    "",
    {
      example: "reaction {add|remove} <CONFIG-NAME> <EMOJI> <ROLE>",
      description: "Pair a reaction with a role for the given config.",
      keywords: ["react", "reaction", "reaction add", "reaction remove"],
      arguments: [
        {
          name: "<CONFIG-NAME>",
          description: "A valid name of an existing reactrole configuration.",
        },
        {
          name: "<EMOJI>",
          description:
            "A unicode emoji character.\n_Note that plaintext emoji IDs like `:grin:` might not work._",
        },
        {
          name: "<ROLE>",
          description:
            "The name of a role in your guild. This will be assigned to the user should they react with the given emoji." +
            "\n_Only necessary for `reaction add`._",
        },
      ],
    },
    {
      keywords: ["message", "message set"],
      example: "message set <CONFIG-NAME> <TEMPLATE-NAME>",
      description: "Assigns the message to which the reactions are appended.",
      arguments: [
        {
          name: "<CONFIG-NAME>",
          description: "A valid name of an existing reactrole configuration.",
        },
        {
          name: "<TEMPLATE-NAME>",
          description: `The name of a pre-prepared bot message. You can create one by following the instructions at \`${this.config.prefix}message editor\`.`,
        },
      ],
    },
    "",
    {
      keywords: ["link"],
      example: "link <CONFIG-NAME> <CONFIG-NAME>",
      description: "Makes users have to react to both messages before receiving a role.",
      arguments: [
        {
          name: "<CONFIG-NAME>",
          description: "A valid name of an existing reactrole configuration.",
        },
        {
          name: "<CONFIG-NAME>",
          description: "A valid name of _another_ existing reactrole configuration.",
        },
      ],
    },
    {
      example: "unlink <CONFIG-NAME>",
      description: "Removes all links from a specific config.",
    },
  ];

  static dependencies = ["databaseMan", "commands/message"];
  databaseMan: DatabaseMan | undefined = this.bot.plugins.get(
    "DatabaseMan"
  ) as DatabaseMan;
  messageMan: MessageMan | undefined = this.bot.plugins.get("MessageMan") as MessageMan;

  listeners: {
    [chainRootConfigName: string]: ReactRoleChainListener;
  } = {};

  emojiRegex = emojiRegex();

  getConfig = async (
    guild: GuildOrGuildID,
    configName: string
  ): Promise<ReactRoleConfig> => {
    // Name validation
    if (configName.match(alphaNumericRegex))
      throw new Error(
        "Name may only contain alphanumeric characters as well as `-` and `_`."
      );

    const config = await this.databaseMan?.getGuildData<ReactRoleConfig>(
      guild,
      `reactrole/config/${configName}`
    );

    if (!config) throw new Error("No config with given name was found");
    return config;
  };

  findConfigChainRoot = async (
    guild: GuildOrGuildID,
    configName: string,
    callbackFn?: (configName: string) => void
  ): Promise<string> => {
    const linker =
      (await this.databaseMan?.getGuildData<string>(
        guild,
        `reactrole/link/linkees/${configName}`
      )) || "";

    if (callbackFn) callbackFn(configName);
    return !linker ? configName : await this.findConfigChainRoot(guild, linker);
  };

  forEachConfigChainMember = async (
    guild: GuildOrGuildID,
    chainRoot: string,
    callbackFn: (configName: string, index: number) => void | Promise<void>
  ): Promise<void> => {
    let index = 0;
    const recursiveFn = async (linker: string): Promise<void> => {
      if (!linker) return;
      const linkeeRight =
        (await this.databaseMan?.getGuildData<string>(
          guild,
          `reactrole/link/linkers/${linker}`
        )) || "";

      await callbackFn(linker, index);
      if (!linkeeRight) return;
      index++;

      return await recursiveFn(linkeeRight);
    };
    await recursiveFn(chainRoot);
  };

  assignConfigToChannel = async (
    guild: Guild | null,
    configName: string,
    channelName: string,
    chainRootName = ""
  ): Promise<void> => {
    if (!chainRootName) {
      chainRootName = await this.findConfigChainRoot(guild, configName);
      return await this.assignConfigToChannel(
        guild,
        chainRootName,
        channelName,
        chainRootName
      );
    }

    const config = await this.getConfig(guild, configName);
    const channel = findChannel(guild, channelName);

    let observables: Message[] | undefined;
    try {
      observables = await this.messageMan?.sendMessage(
        guild,
        channel,
        config.templateName
      );
    } catch (err) {
      // Custom error messages
      if (err.message === "Invalid message ID")
        throw new Error(
          `Config \`${configName}\` does not have a message template defined.`
        );
      throw err;
    }
    if (!observables) throw new Error("Message template is empty.");

    // Append reactions to the last message
    for (const reactable of config.reactions) {
      await observables[observables.length - 1].react(reactable.emoji);
    }

    // Remove last messages, if there are any
    if (config.observables.channelID) {
      await this.removeConfigFromChannelOnce(guild, configName, true);
    }

    // Remember observable
    await this.databaseMan?.setGuildData<MessagePosData>(
      guild,
      `reactrole/config/${configName}/observables`,
      {
        channelID: channel.id,
        messageIDs: observables.map(obs => obs.id),
      },
      true
    );

    const reactionListener = this.listeners[chainRootName];
    if (!reactionListener) {
      this.listeners[chainRootName] = new ReactRoleChainListener(
        this.client,
        guild,
        config
      );
    } else {
      reactionListener.addConfig(config);
    }

    // Continue with next config in the chain
    const linkPairRight =
      (await this.databaseMan?.getGuildData<string>(
        guild,
        `reactrole/link/linkers/${configName}`
      )) || "";
    if (linkPairRight) {
      return await this.assignConfigToChannel(
        guild,
        linkPairRight,
        channelName,
        chainRootName
      );
    }
  };

  removeConfigFromChannelOnce = async (
    guild: Guild | null,
    configName: string,
    skipDBEntry = false
  ): Promise<void> => {
    await this.getConfig(guild, configName);
    const observablesPosData = await this.databaseMan?.getGuildData<MessagePosData>(
      guild,
      `reactrole/config/${configName}/observables`
    );
    if (!observablesPosData) throw new Error("Could not locate message in channel.");
    if (!observablesPosData.messageIDs || !observablesPosData.channelID)
      throw new Error("The given config is currently unused.");

    // Retrieve the channel the messages are in
    const channel = guild?.channels.cache.get(observablesPosData.channelID) as
      | TextChannel
      | undefined;

    if (!channel)
      throw new Error("The text-channel could not be found. Please continue manually.");

    // Locate messages and delete them
    for (const messageID of observablesPosData.messageIDs) {
      const observable = await channel.messages.fetch(messageID);
      if (observable.deletable) await observable.delete({ reason: "Reactrole deletion" });
      else throw new Error("Could not delete a message. Please continue manually.");
    }

    if (skipDBEntry) return;

    // Save changes
    await this.databaseMan?.setGuildData<MessagePosData>(
      guild,
      `reactrole/config/${configName}/observables`,
      {
        channelID: "",
        messageIDs: [],
      },
      true
    );
  };

  removeConfigFromChannel = async (
    guild: Guild | null,
    configName: string,
    ignoreDB = false,
    chainRootName = ""
  ): Promise<void> => {
    // Find chain root first and start off there
    if (!chainRootName) {
      chainRootName = await this.findConfigChainRoot(guild, configName);
      return await this.removeConfigFromChannel(
        guild,
        chainRootName,
        ignoreDB,
        chainRootName
      );
    }

    // Remove message
    await this.removeConfigFromChannelOnce(guild, configName, ignoreDB);

    // Remove listener
    const listener = this.listeners[chainRootName];
    if (listener) {
      listener.unload();
      delete this.listeners[chainRootName];
    }

    // Continue with next config in the chain
    const linkPairRight =
      (await this.databaseMan?.getGuildData<string>(
        guild,
        `reactrole/link/linkers/${configName}`
      )) || "";
    if (linkPairRight) {
      return await this.removeConfigFromChannel(
        guild,
        linkPairRight,
        ignoreDB,
        chainRootName
      );
    }
  };

  // Removes old reactions and adds the ones we listen for
  resetReactions = async (guild: Guild, config: ReactRoleConfig): Promise<void> => {
    if (!config.observables.channelID) return;
    const channel = guild.channels.cache.get(config.observables.channelID);
    if (!channel || !isTextChannel(channel)) return;
    const lastMessageID =
      config.observables.messageIDs[config.observables.messageIDs.length - 1];
    const message = await channel.messages.fetch(lastMessageID);
    if (!message) return;

    await message.reactions.removeAll();
    for (const pair of config.reactions) await message.react(pair.emoji);
  };

  executeAdd = async (
    message: Message,
    args: string[],
    getHelp: (args?: string[]) => void
  ): Promise<void> => {
    const { guild } = message;
    const [configName, templateName] = args;
    if (!configName) return getHelp(["add"]);

    try {
      // Name validation
      if (configName.match(alphaNumericRegex))
        throw new Error(
          "Name may only contain alphanumeric characters as well as `-` and `_`."
        );

      // Make sure no config exists with the given name
      const existanceCheck = await this.databaseMan?.getGuildData(
        guild,
        `reactrole/config/${configName}`
      );
      if (existanceCheck) throw new Error("There is already a config with this name.");

      // The function throws errors if there's any issue with the given template name.
      if (templateName) await this.messageMan?.getMessageInfo(guild, templateName);

      await this.databaseMan?.setGuildData(guild, `reactrole/config/${configName}`, {
        templateName: templateName || "",
        reactions: [],
        observables: {
          channelID: "",
          messageIDs: [],
        },
      } as ReactRoleConfig);

      message.react("✅");
    } catch (err) {
      return sendError(message, err);
    }
  };

  executeRemove = async (
    message: Message,
    args: string[],
    getHelp: (args?: string[]) => void
  ): Promise<void> => {
    const { guild } = message;
    const [configName] = args;
    if (!configName) return getHelp(["remove"]);

    try {
      await this.getConfig(guild, configName);

      try {
        this.executeUnlink(message, [configName], getHelp);
      } catch (err) {
        throw new Error("Error while unlinking config:\n" + err);
      }

      await this.databaseMan?.deleteGuildData(guild, `reactrole/config/${configName}`);
      message.react("✅");
    } catch (err) {
      return sendError(message, err);
    }
  };

  executeReact = async (
    message: Message,
    args: string[],
    getHelp: (args?: string[]) => void
  ): Promise<void> => {
    const { guild } = message;
    const [task, configName, proposedEmoji, proposedRole] = args;
    if (args.length < 3) return getHelp(["react"]);

    try {
      await this.getConfig(guild, configName);

      if (task === "add") {
        // Does the emoji exist
        const [emoji] = proposedEmoji.match(this.emojiRegex) || [];
        if (!emoji) throw new Error("Invalid emoji, please try another one");

        // Does the role exist
        const { id: role } = findRole(guild, proposedRole);

        // Is the role already used in the array
        const objIndexWithRole =
          (await this.databaseMan?.getGuildDataIndex(
            guild,
            `reactrole/config/${configName}/reactions`,
            role,
            "role"
          )) ?? -1;
        if (objIndexWithRole >= 0)
          throw new Error("Role already bound to an emoji in this configuration");

        // Write data to array in DB
        await this.databaseMan?.setGuildData<ReactionPair>(
          guild,
          `reactrole/config/${configName}/reactions[]`,
          { emoji, role },
          true
        );
      } else if (task === "remove") {
        await this.databaseMan?.deleteGuildData(
          guild,
          `reactrole/config/${configName}/reactions`,
          proposedEmoji,
          "emoji"
        );
      } else return getHelp(["react"]);

      message.react("✅");
    } catch (err) {
      return sendError(message, err, 10);
    }
  };

  executeLink = async (
    message: Message,
    args: string[],
    getHelp: (args?: string[]) => void
  ): Promise<void> => {
    const { guild } = message;
    const [linker, linkee] = args;
    if (!linker || !linkee) return getHelp(["link"]);

    try {
      // Make sure configs exist
      for (let i = 0; i < 2; i++) {
        const config = await this.getConfig(guild, args[i]);
        if (!config) throw new Error("At least one of the two configs does not exist.");
        if (config.observables.channelID)
          throw new Error(
            `Config \`${args[i]}\` is currently used in a text-channel.\n` +
              `Please remove it first with \`${
                this.config.prefix + this.command
              } channel remove ${args[i]}\``
          );
      }

      // Notify the user of existing links
      const existingLink = await this.databaseMan?.getGuildData<string>(
        guild,
        `reactrole/link/linkers/${linker}`
      );
      if (existingLink)
        message.reply(
          `the config \`${linker}\` was linked to \`${existingLink}\` until now. ` +
            `This has now been **overwritten**.`
        );

      // Double linking to index easier later down the line.
      await this.databaseMan?.setGuildData<string>(
        guild,
        `reactrole/link/linkers/${linker}`,
        linkee
      );
      await this.databaseMan?.setGuildData<string>(
        guild,
        `reactrole/link/linkees/${linkee}`,
        linker
      );

      await message.react(`✅`);
    } catch (err) {
      return sendError(message, err);
    }
  };

  executeUnlink = async (
    message: Message,
    args: string[],
    getHelp: (args?: string[]) => void
  ): Promise<void> => {
    const { guild } = message;
    const [linker] = args;
    if (!linker) return getHelp(["link"]);

    try {
      const linkees: string[] = [];
      const pathModifier = ["linkees", "linkers"];

      // Make sure config exists
      const config = await this.getConfig(guild, linker);
      if (!config) throw new Error("Invalid config name");
      if (config.observables.channelID)
        throw new Error(
          `The given config is currently used in a text-channel.\n` +
            `Please remove it first with \`${
              this.config.prefix + this.command
            } channel remove ${linker}\``
        );

      // Retrieve linkees from both directions
      for (let i = 0; i < 2; i++) {
        linkees.push(
          (await this.databaseMan?.getGuildData<string>(
            guild,
            `reactrole/link/${pathModifier[i]}/${linker}`
          )) || ""
        );
      }

      if (!linkees[0] && !linkees[1])
        throw new Error(`\`${linker}\` is currently not linked to anything.`);

      // Remove both links
      const deletionChain = [
        [linkees[0], linker],
        [linker, linkees[1]],
      ];
      for (const deletables of deletionChain) {
        if (!deletables[0] || !deletables[1]) continue;

        await this.databaseMan?.setGuildData(
          guild,
          `reactrole/link/linkers/${deletables[0]}`,
          ""
        );
        await this.databaseMan?.setGuildData(
          guild,
          `reactrole/link/linkees/${deletables[1]}`,
          ""
        );
      }

      await message.channel.send(
        new MessageEmbed({
          title: "Unlink successful",
          description:
            (linkees[0] ? `--[${linkees[0]}]​ ​ ​ ​` : "--") +
            `[${linker}]` +
            (linkees[1] ? `​ ​ ​ ​[${linkees[1]}]--` : "--"),
        })
      );
      await message.react(`✅`);
    } catch (err) {
      return sendError(message, err);
    }
  };

  executeMessageSet = async (
    message: Message,
    args: string[],
    getHelp: (args?: string[]) => void
  ): Promise<void> => {
    const { guild } = message;
    const [, configName, templateName] = args;
    if (!configName || !templateName) return getHelp(["message"]);

    try {
      // Input validity checks
      await this.getConfig(guild, configName);
      await this.messageMan?.getMessageInfo(guild, templateName);

      await this.databaseMan?.setGuildData(
        guild,
        `reactrole/config/${configName}/templateName`,
        templateName,
        true
      );
      await message.react(`✅`);
    } catch (err) {
      return sendError(message, err);
    }
  };

  executeChannel = async (
    message: Message,
    args: string[],
    getHelp: (args?: string[]) => void
  ): Promise<void> => {
    const { guild } = message;
    const [modifier, configName, channelName] = args;

    try {
      if (modifier === "set" && args.length >= 3) {
        await this.assignConfigToChannel(guild, configName, channelName);
      } else if (modifier === "remove" && args.length >= 2) {
        await this.removeConfigFromChannel(guild, configName);
      } else return getHelp(["channel"]);

      await message.react(`✅`);
    } catch (err) {
      // Custom error if message has not been found
      if (err.message && err.message.indexOf("No message with given name") > -1)
        return sendError(
          message,
          `Your current config does not have a message template defined. ` +
            `Please use \`${this.config.prefix + this.command} message set\` first.`,
          20
        );
      return sendError(message, err);
    }
  };

  executeList = async (message: Message, args: string[]): Promise<void> => {
    const { guild } = message;
    const [startingPoint] = args;
    if (!guild) return;

    try {
      const formatConfigChain = async (
        chainRoot: string,
        configToHighlight?: string
      ): Promise<string> => {
        const configChain: string[] = [];
        await this.forEachConfigChainMember(guild, chainRoot, configName => {
          if (configToHighlight && configName === configToHighlight)
            configName = `__${configName}__`;
          configChain.push(configName);
        });
        if (configChain.length <= 1) return `The config is not linked to anything.`;
        return configChain.join(" 🔗 ");
      };

      // Print config specific information if valid config name is given.
      if (startingPoint) {
        const config = await this.getConfig(guild, startingPoint);
        const fields: MessageEmbed["fields"] = [];
        let hasWarnings = false;

        // Reaction list generation
        const { reactions } = config;
        const formattedReactions: string[] = [];
        for (const reaction of reactions) {
          const role = await guild.roles.fetch(reaction.role);
          const roleName = role ? role.name : `_[DELETED ROLE]_`;
          if (!role) hasWarnings = true;

          formattedReactions.push(`${reaction.emoji} => ${roleName}`);
        }
        if (formattedReactions.length == 0)
          formattedReactions.push(`There are no reactions set yet.`);
        fields.push({
          inline: false,
          name: "Reactions/Roles",
          value: formattedReactions.join("\n"),
        });

        // Observing message
        const { observables } = config;
        const formattedObservable = observables.channelID
          ? `Click [here](https://discord.com/channels/${guild.id}/${observables.channelID}/${observables.messageIDs[0]}) to see the config in action.`
          : "The config is currently not in use.";
        fields.push({
          inline: false,
          name: "Usage",
          value: formattedObservable,
        });

        // Config chain generation
        const chainRoot = await this.findConfigChainRoot(guild, startingPoint);
        const formattedChain = await formatConfigChain(chainRoot, startingPoint);
        if (formattedChain.trim().length > startingPoint.trim().length)
          fields.push({
            inline: false,
            name: "Chain relation",
            value: formattedChain,
          });

        const sentMessage = await message.channel.send(
          new MessageEmbed({
            title: `About "${startingPoint}"`,
            description: "",
            fields,
          })
        );

        if (hasWarnings) await sentMessage.react("⚠");
      } else {
        const configChains: string[] = [];
        const configs = await this.databaseMan?.getGuildData<{
          [name: string]: ReactRoleConfig;
        }>(guild, `reactrole/config`);

        if (configs) {
          const configNames = Object.keys(configs);

          const linkPairsRight =
            (await this.databaseMan?.getGuildData<{
              [name: string]: string;
            }>(guild, `reactrole/link/linkers`)) || {};

          const linkPairsLeft =
            (await this.databaseMan?.getGuildData<{
              [name: string]: string;
            }>(guild, `reactrole/link/linkees`)) || {};

          while (configNames.length > 0) {
            let chainRootFound = false;
            const getLinkee = (linker: string): string => {
              const index = configNames.indexOf(linker);
              configNames.splice(index, 1);

              // First, we look for the beginning of the chain.
              const linkeeLeft = linkPairsLeft[linker];
              if (linkeeLeft && !chainRootFound) return getLinkee(linkeeLeft);
              else chainRootFound = true;

              // Then we recursively append each linkee on the right.
              const linkeeRight = linkPairsRight[linker];
              const suffix = !linkeeRight ? "" : ` 🔗 ${getLinkee(linkeeRight)}`;
              return linker + suffix;
            };
            configChains.push(getLinkee(configNames[0]));
          }
        }

        const description = !configChains
          ? "There are no configs yet. " +
            `Create one with \`${this.config.prefix + this.command} add\` first.`
          : configChains.join("\n");

        await message.channel.send(
          new MessageEmbed({
            title: "List of reactrole configs",
            description,
          })
        );
      }
    } catch (err) {
      return sendError(message, err);
    }
  };

  executeClear = async (message: Message, args: string[]): Promise<void> => {
    const { guild } = message;
    const [configName] = args;
    if (!configName || !guild)
      return sendError(message, "You need a config name for this to work.");

    try {
      const config = await this.getConfig(guild, configName);
      await this.resetReactions(guild, config);
    } catch (err) {
      return sendError(message, err);
    }
  };

  execute = (
    message: Message,
    args: string[],
    getHelp: (args?: string[]) => void
  ): void => {
    switch (args.shift()) {
      case "add":
      case "new":
      case "create":
        this.executeAdd(message, args, getHelp);
        break;

      case "remove":
      case "delete":
      case "rm":
        this.executeRemove(message, args, getHelp);
        break;

      case "reaction":
      case "react":
        this.executeReact(message, args, getHelp);
        break;

      case "link":
        this.executeLink(message, args, getHelp);
        break;

      case "unlink":
        this.executeUnlink(message, args, getHelp);
        break;

      case "message":
        this.executeMessageSet(message, args, getHelp);
        break;

      case "channel":
        this.executeChannel(message, args, getHelp);
        break;

      case "clearreactions":
        this.executeClear(message, args);
        break;

      case "list":
        this.executeList(message, args);
        break;

      default:
        getHelp();
        return;
    }
  };

  // Start listeners for all existing guilds.
  loadConfigsInUse = async (): Promise<void> => {
    const guilds = await this.databaseMan?.getAllGuildIDs();
    guilds?.forEach(async guildID => {
      let guild: Guild;

      // Retrieve guild object
      try {
        const proposedGuild = await this.client.guilds.fetch(guildID);
        if (!proposedGuild) return;
        guild = proposedGuild;
      } catch (err) {
        console.error("[loadConfigsInUse]", err);
        return;
      }

      // Retrieve all config objects in a given guild
      const configs = await this.databaseMan?.getGuildData<{
        [id: string]: ReactRoleConfig;
      }>(guildID, `reactrole/config`);
      if (!configs) return;

      // Retrieve the list of all config names
      const configNames = Object.keys(configs);

      // Function used to constantly reduce the size of the configNames array.
      const removeConfigFromArray = (removableConfigName: string) => {
        const index = configNames.indexOf(removableConfigName);
        if (index >= 0) configNames.splice(index, 1);
      };

      // Loop for establishing chains and creating listeners for them.
      // The loop stops as soon as each config has been analysed.
      while (configNames.length > 0) {
        // While looking for the chain root, we also mark each config found as analysed.
        const chainRoot = await this.findConfigChainRoot(
          guild,
          configNames[0],
          removeConfigFromArray
        );

        // If the config has no observable, it is not in use.
        const chainRootConfig = configs[chainRoot];
        if (!chainRootConfig || !chainRootConfig.observables.channelID) continue;
        await this.resetReactions(guild, chainRootConfig);

        const listener = new ReactRoleChainListener(this.client, guild, chainRootConfig);
        await this.forEachConfigChainMember(
          guild,
          chainRoot,
          async (configName, i): Promise<void> => {
            // This is the second time this function is executed,
            // but is needed to mark configs after configNames[0] as analysed.
            removeConfigFromArray(configName);

            // Chain root is already being observed by the listener
            if (i < 1) return;

            // Append each linked member to the chain listener
            const linkeeConfig = configs[configName];
            if (!linkeeConfig) return;
            await this.resetReactions(guild, linkeeConfig);
            listener.addConfig(linkeeConfig);
          }
        );

        // Add new listener to listener hoarder
        this.listeners[chainRoot] = listener;
      }
    });
  };

  load = async (): Promise<void> => {
    this.registerCommand();
    await this.loadConfigsInUse();
  };

  unload = (): void => {
    for (const key in this.listeners) {
      this.listeners[key].unload();
      delete this.listeners[key];
    }
  };
}
