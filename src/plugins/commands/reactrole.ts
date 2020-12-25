import { CommandPlugin, UsageArray } from "../../utils/PluginStructs";
import { Guild, Message } from "discord.js";
import DatabaseMan from "../databaseMan";
import { alphaNumericRegex, findRole, sendError } from "../../utils";
import MessageMan from "./message";

interface ReactionPair {
  emoji: string;
  role: string;
}

interface ReactRoleConfig {
  templateName: string;
  reactions: ReactionPair[];
}

/**
 * A script for assigning roles to users depending on which emoji they react with on a text-message.
 */
export default class ReactRole extends CommandPlugin {
  command = "reactrole";
  description =
    "Assign roles based on which emoji users react with on a specific message.";
  usage: UsageArray = [
    {
      example: "add <NAME> [TEMPLATE NAME]",
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
        "Removes an existing reactrole config and deletes any active message along with it.",
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
  ];

  static dependencies = ["databaseMan", "commands/message"];
  databaseMan: DatabaseMan | undefined = this.bot.plugins.get(
    "DatabaseMan"
  ) as DatabaseMan;
  messageMan: MessageMan | undefined = this.bot.plugins.get("MessageMan") as MessageMan;

  getConfig = async (
    guild: Guild | null,
    configName: string
  ): Promise<ReactRoleConfig> => {
    // Name validation
    if (configName.match(alphaNumericRegex))
      throw new Error(
        "Name may only contain alphanumeric characters as well as `-` and `_`."
      );

    const config = await this.databaseMan?.getGuildData<ReactRoleConfig>(
      guild,
      `reactroleConfigs/${configName}`
    );

    if (!config) throw new Error("No config with given name was found");
    return config;
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
        `reactroleConfigs/${configName}`
      );
      if (existanceCheck) throw new Error("There is already a config with this name.");

      // The function throws errors if there's any issue with the given template name.
      if (templateName) await this.messageMan?.getMessageInfo(guild, templateName);

      await this.databaseMan?.setGuildData(guild, `reactroleConfigs/${configName}`, {
        templateName: templateName || "",
        reactions: [],
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
      await this.databaseMan?.deleteGuildData(guild, `reactroleConfigs/${configName}`);
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
        const [emoji] =
          proposedEmoji.match(
            /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/
          ) || [];
        if (!emoji) throw new Error("Invalid emoji, please try another one");

        // Does the role exist
        const { id: role } = findRole(guild, proposedRole);

        // Is the role already used in the array
        const objIndexWithRole =
          (await this.databaseMan?.getGuildDataIndex(
            guild,
            `reactroleConfigs/${configName}/reactions`,
            role,
            "role"
          )) ?? -1;
        if (objIndexWithRole >= 0)
          throw new Error("Role already bound to an emoji in this configuration");

        // Is the emojie already used in the array
        const objIndexWithEmoji =
          (await this.databaseMan?.getGuildDataIndex(
            guild,
            `reactroleConfigs/${configName}/reactions`,
            emoji,
            "emoji"
          )) ?? -1;
        if (objIndexWithEmoji >= 0)
          throw new Error("Emoji already bound to a role in this configuration");

        // Write data to array in DB
        await this.databaseMan?.setGuildData<ReactionPair>(
          guild,
          `reactroleConfigs/${configName}/reactions[]`,
          { emoji, role },
          true
        );
      } else if (task === "remove") {
        await this.databaseMan?.deleteGuildData(
          guild,
          `reactroleConfigs/${configName}/reactions`,
          proposedEmoji,
          "emoji"
        );
      } else return getHelp(["react"]);

      message.react("✅");
    } catch (err) {
      return sendError(message, err, 10);
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

      default:
        getHelp();
        break;
    }
  };
}
