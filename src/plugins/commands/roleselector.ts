/* eslint-disable @typescript-eslint/no-empty-function */
import { SlashCommandBuilder } from "@discordjs/builders";
import {
  CacheType,
  CommandInteraction,
  Guild,
  MessageEmbed,
  Snowflake,
} from "discord.js";
import {
  staticImplements,
  ICommandPluginClass,
  CommandError,
} from "../../types/DissidiumPlugin";
import DatabasePlugin from "../database";
import MessageCommand from "./message";

const alphaNumericRegex = /[^A-Za-z0-9_-]/g;

/**
 * Database structure for all roleselector configs
 */
type RoleselectorDB = {
  [name: string]: RoleselectorConfig | undefined;
};

/**
 * Main configuration object of a role selector
 */
type RoleselectorConfig = {
  messageName: string;
  observable: ObservableDiscordMessage | null;
  options: RoleselectorOption[];
};

/**
 * Represents a button in a role selector
 */
type RoleselectorOption = {
  roleId: Snowflake;
  label?: string;
};

/**
 * Used to store an exact guild message into a database
 */
type ObservableDiscordMessage = {
  channelId: Snowflake;
  messageId: Snowflake;
};

/**
 * Enables role selection for users through an interactive command-message.
 */
@staticImplements<ICommandPluginClass<[DatabasePlugin, MessageCommand]>>()
export default class RoleselectorCommandPlugin {
  static pluginName = "command-roleselector";
  static dependencies = ["database", "command-message"];

  commandName = "roleselector";
  data = new SlashCommandBuilder()
    .setName("roleselector")
    .setDescription(
      "Allow users to select their own role through an interactive message."
    )
    .addSubcommand(sc =>
      sc
        .setName("add")
        .setDescription("Create a new reactrole config")
        .addStringOption(so =>
          so
            .setRequired(true)
            .setName("config-name")
            .setDescription("A unique identifier for the given role selector config.")
        )
        .addStringOption(so =>
          so
            .setRequired(false)
            .setName("message-name")
            .setDescription(
              `The unique identifier of a bot message. You can create one via "/message editor".`
            )
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("remove")
        .setDescription("Remove a config and deletes any message bound to it.")
        .addStringOption(so =>
          so
            .setRequired(true)
            .setName("config-name")
            .setDescription("The unique identifier of the config you'd like to delete")
        )
    )
    .addSubcommandGroup(scg =>
      scg
        .setName("channel")
        .setDescription("Define which channel to post the role selector to.")
        .addSubcommand(sc =>
          sc
            .setName("set")
            .setDescription("Assign a role selector to a text-channel.")
            .addStringOption(so =>
              so
                .setRequired(true)
                .setName("config-name")
                .setDescription(
                  "The unique identifier of the role selector you'd like to assign to a channel."
                )
            )
            .addChannelOption(co =>
              co
                .setRequired(true)
                .setName("channel")
                .setDescription(
                  "The text-channel you'd like to assign the role selector to."
                )
            )
        )
        .addSubcommand(sc =>
          sc
            .setName("remove")
            .setDescription("Remove a role selector from its assigned text-channel.")
            .addStringOption(so =>
              so
                .setRequired(true)
                .setName("config-name")
                .setDescription(
                  "The unique identifier of the role selector you'd like to remove from all channels."
                )
            )
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("list")
        .setDescription("List all available role selector configurations.")
    )
    .addSubcommandGroup(scg =>
      scg
        .setName("option")
        .setDescription("Pair a role with a selector.")
        .addSubcommand(sc =>
          sc
            .setName("add")
            .setDescription("Add a new role option to a selector.")
            .addStringOption(so =>
              so
                .setName("config-name")
                .setDescription(
                  "The unique identifier of the role selector you'd like to append the new option to."
                )
                .setRequired(true)
            )
            .addRoleOption(ro =>
              ro
                .setName("role")
                .setDescription("The guild role to add to the selector as an option.")
                .setRequired(true)
            )
            .addStringOption(so =>
              so
                .setName("button-label")
                .setDescription("The text shown on the button for the given role.")
                .setRequired(false)
            )
        )
        .addSubcommand(sc =>
          sc
            .setName("remove")
            .setDescription("Remove a role option from a selector.")
            .addStringOption(so =>
              so
                .setName("config-name")
                .setDescription(
                  "The unique identifier of the role selector you'd like to remove the option from."
                )
                .setRequired(true)
            )
            .addRoleOption(ro =>
              ro
                .setName("role")
                .setDescription("The guild role to remove from the selector.")
                .setRequired(true)
            )
        )
        .addSubcommand(sc =>
          sc
            .setName("remove-stale")
            .setDescription(
              "Remove all role options from a selector which do not exist anymore."
            )
            .addStringOption(so =>
              so
                .setName("config-name")
                .setDescription(
                  "The unique identifier of the role selector you'd like to inspect for stale roles."
                )
                .setRequired(true)
            )
        )
    )
    .addSubcommandGroup(scg =>
      scg
        .setName("message")
        .setDescription("Manage the messages that are shown along the role selector.")
        .addSubcommand(sc =>
          sc
            .setName("set")
            .setDescription(
              "Tell a role selector which message to accompany the buttons with."
            )
            .addStringOption(so =>
              so
                .setName("config-name")
                .setDescription(
                  "The unique identifier of the role selector you'd like to pair the message with."
                )
                .setRequired(true)
            )
            .addStringOption(so =>
              so
                .setName("message-name")
                .setDescription(
                  `The unique identifier of a bot message created and managed via "/message".`
                )
                .setRequired(true)
            )
        )
    );

  /**
   * Retrieve the list of all roleselectors of a given guild.
   *
   * @param guildId The id of the guild the roleselectors belong to
   * @returns A mutable list of roleselectors from the database
   */
  private getRoleselectors = async (guildId: Guild["id"]) =>
    await this.db.getGuildData<RoleselectorDB>(guildId, "roleselectors", {});

  /**
   * Parses the config name parameter sent by the user by validating the input
   *
   * @param interaction A live interaction object from Discord.js invoked by a command
   * @returns The proposed configuration name
   */
  private getConfigName = (interaction: CommandInteraction<CacheType>) => {
    const configName = interaction.options.getString("config-name", true);

    // Name validation
    if (configName.match(alphaNumericRegex))
      throw new CommandError(
        "Parameter `config-name` may only contain alphanumeric characters as well as `-` and `_`."
      );

    return configName;
  };

  /**
   * Executes each time a user uses the add slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onAddCommand = async (interaction: CommandInteraction<"present">) => {
    const { guildId } = interaction;
    const configName = this.getConfigName(interaction);
    const messageName = interaction.options.getString("message-name", false) ?? "";

    // Retrieving all roleselector configs for the given guild
    const roleselectors = await this.getRoleselectors(guildId);

    // Make sure no config exists with the given name
    if (typeof roleselectors[configName] !== "undefined")
      throw new CommandError(
        `There is already a roleselector configuration called "${configName}".`
      );

    // The function throws errors if there's any issue with the given template name.
    if (messageName && !(await this.messager.getMessageInfo(guildId, messageName)))
      throw new CommandError(`Message "${messageName}" was not found.`);

    roleselectors[configName] = {
      messageName,
      observable: null,
      options: [],
    };

    await this.db.save();
    await interaction.reply(`✅ Successfully created role selector "${configName}"!`);
  };

  /**
   * Executes each time a user uses the remove slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onRemoveCommand = async (interaction: CommandInteraction<"present">) => {
    const { guildId } = interaction;
    const configName = this.getConfigName(interaction);

    // Retrieving all roleselector configs for the given guild
    const roleselectors = await this.getRoleselectors(guildId);

    // Make sure config with the given name exists
    if (typeof roleselectors[configName] === "undefined")
      throw new CommandError(
        `There is no role selector configuration called "${configName}".`
      );

    delete roleselectors[configName];
    await this.db.save();

    await interaction.reply(`✅ Successfully removed role selector "${configName}"!`);
  };

  /**
   * Executes each time a user uses the list slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onListCommand = async (interaction: CommandInteraction<"present">) => {
    const { guildId } = interaction;

    // Check guild availability in cache
    if (!interaction.guild)
      throw new CommandError(
        "Unable to connect to guild services. Please try again later.",
        false
      );

    const configList: string[] = [];

    const roleselectors = await this.getRoleselectors(guildId);
    for (const configName in roleselectors) {
      const roleselector = roleselectors[configName];
      if (!roleselector) continue;

      const { observable } = roleselector;
      const statusText = observable
        ? `[In use](https://discord.com/channels/${guildId}/${observable.channelId}/${observable.messageId})`
        : "`Unused`";

      const headerText =
        `**${configName}**` +
        " - " +
        `[Message ID: \`${roleselector.messageName || "<EMPTY>"}\`]` +
        " - " +
        `[Status: ${statusText}]`;

      const formattedRoleList: string[] = [];
      for (const option of roleselector.options) {
        const role = await interaction.guild.roles.fetch(option.roleId);
        const roleName = role?.name ?? `_<DELETED ROLE>_`;

        formattedRoleList.push(
          `​    • ${option.label ?? roleName} - [Role: \`${roleName}\`]`
        );
      }

      configList.push(headerText + "\n" + formattedRoleList.join("\n") + "\n");
    }

    const description = !configList
      ? "There are currently 0 configurations in this guild. Create one with `/roleselector add` first."
      : configList.join("\n");

    await interaction.reply({
      ephemeral: true,
      embeds: [
        new MessageEmbed({
          title: "List of role selectors and their options:",
          description,
        }),
      ],
    });
  };

  /**
   * Executes each time a user uses the option slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onOptionCommand = async (interaction: CommandInteraction<"present">) => {
    const { guildId, options } = interaction;
    const subcommand = options.getSubcommand(true);
    const configName = this.getConfigName(interaction);

    const roleselectors = await this.getRoleselectors(guildId);
    const roleselector = roleselectors[configName];

    // Make sure config with the given name exists
    if (typeof roleselector === "undefined")
      throw new CommandError(
        `There is no role selector configuration called "${configName}".`
      );

    // Handle remove-stale command
    if (subcommand === "remove-stale") {
      let staleCount = 0;
      for (let i = 0; i < roleselector.options.length; i++) {
        const option = roleselector.options[i];
        const fetchedRole = await interaction.guild?.roles.fetch(option.roleId);

        if (!fetchedRole) {
          roleselector.options.splice(i, 1);
          staleCount++;
        }
      }

      if (!staleCount)
        throw new CommandError(
          `There are no stale roles as options in the role selector "${configName}".`
        );

      await this.db.save();
      await interaction.reply(
        `✅ Successfully removed \`${staleCount}\` stale role${
          staleCount === 1 ? "" : "s"
        } from the selector "${configName}"!`
      );

      return;
    }

    // Both add and remove need this variable
    const role = options.getRole("role", true);

    if (subcommand === "add") {
      const buttonLabel = options.getString("button-label", false) || undefined;

      if (roleselector.options.length >= 25)
        throw new CommandError("A role selector can't have more than 25 options.");

      roleselector.options.push({
        roleId: role.id,
        label: buttonLabel,
      });

      await this.db.save();
      await interaction.reply(
        `✅ Successfully added role "${role.name}" as an option to the selector "${configName}"!`
      );
      return;
    }

    if (subcommand === "remove") {
      const idx = roleselector.options.findIndex(option => option.roleId === role.id);
      if (idx < 0)
        throw new CommandError(
          `Role "${role.name}" is not listed as an option in the selector "${configName}".`
        );

      roleselector.options.splice(idx, 1);
      await this.db.save();

      await interaction.reply(
        `✅ Successfully removed role "${role.name}" as an option from the selector "${configName}"!`
      );
      return;
    }

    throw new CommandError("Please use the available sub-commands.");
  };

  /**
   * Executes each time a user uses the message slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onMessageCommand = async (interaction: CommandInteraction<"present">) => {
    const { guildId, options } = interaction;
    const subcommand = options.getSubcommand(true);
    const configName = this.getConfigName(interaction);
    const messageName = interaction.options.getString("message-name", true);

    if (subcommand !== "set")
      throw new CommandError("Please use the available sub-commands.");

    // The function throws errors if there's any issue with the given template name.
    if (!(await this.messager.getMessageInfo(guildId, messageName)))
      throw new CommandError(
        `Message "${messageName}" was not found. Create one via \`/message editor\``
      );

    // Get proposed role selector config
    const roleselectors = await this.getRoleselectors(guildId);
    const roleselector = roleselectors[configName];

    // Make sure config with the given name exists
    if (typeof roleselector === "undefined")
      throw new CommandError(
        `There is no role selector configuration called "${configName}".`
      );

    roleselector.messageName = messageName;
    await this.db.save();
    await interaction.reply(
      `✅ Successfully assigned message "${messageName}" to the role selector "${configName}"!`
    );
  };

  /**
   * Executes each time a user uses the channel slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onChannelCommand = async (interaction: CommandInteraction<"present">) => {
    const { guildId, options } = interaction;
    const subcommand = options.getSubcommand(true);
    const configName = this.getConfigName(interaction);

    const roleselectors = await this.getRoleselectors(guildId);
    const roleselector = roleselectors[configName];

    // Make sure config with the given name exists
    if (typeof roleselector === "undefined")
      throw new CommandError(
        `There is no role selector configuration called "${configName}".`
      );

    if (subcommand === "set") {
      const channel = interaction.options.getChannel("channel", true);

      roleselector.observable = {
        channelId: channel.id,
        messageId: "",
      };

      await this.db.save();
      return await interaction.reply(
        `✅ Successfully assigned role selector "${configName}" to <#${channel.id}>!`
      );
    }

    if (subcommand === "remove") {
      const { observable } = roleselector;
      if (!observable)
        throw new CommandError("The role selector is not currently visible anywhere.");

      if (!interaction.guild)
        throw new CommandError(
          "Unable to connect to guild services. Please try again later.",
          false
        );

      // Remove message from channel
      const channel = await interaction.guild.channels.fetch(observable.channelId);
      if (channel && channel.isText()) {
        await channel.messages.delete(observable.messageId);
      }

      // Remove observable from config
      roleselector.observable = null;
      this.db.save();

      return await interaction.reply(
        `✅ Successfully removed role selector "${configName}" from all text-channels!`
      );
    }

    throw new CommandError("Please use the available sub-commands.");
  };

  /**
   * Executes each time a user uses a slash command that refers to this class.
   *
   * @param interaction A live interaction object from Discord.js
   */
  onCommandInteraction = async (interaction: CommandInteraction<CacheType>) => {
    if (!interaction.inGuild())
      throw new CommandError("This command is only executable in guild text-channels.");

    // The roleselector command has at most two sub-commands
    const subcommand = interaction.options.getSubcommand(false);
    const subcommandGroup = interaction.options.getSubcommandGroup(false);

    // The roleselector command has at least one sub-command
    if (!subcommand) throw new CommandError("Please use the available sub-commands.");

    // If two sub-commands are given
    switch (subcommandGroup) {
      case "option":
        await this.onOptionCommand(interaction);
        return;

      case "message":
        await this.onMessageCommand(interaction);
        return;

      case "channel":
        await this.onChannelCommand(interaction);
        return;
    }

    // If only one sub-command is given
    switch (subcommand) {
      case "add":
        await this.onAddCommand(interaction);
        return;

      case "remove":
        await this.onRemoveCommand(interaction);
        return;

      case "list":
        await this.onListCommand(interaction);
        return;
    }

    // Just to have some kind of response
    throw new CommandError(
      "Congratulations! We have no idea how you managed to get this error. Don't worry, nothing happened."
    );
  };

  constructor(private db: DatabasePlugin, private messager: MessageCommand) {}

  start = async () => {};
  stop = async () => {};
}
