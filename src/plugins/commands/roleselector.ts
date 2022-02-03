/* eslint-disable @typescript-eslint/no-empty-function */
import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ButtonInteraction,
  CacheType,
  CommandInteraction,
  Guild,
  MessageActionRow,
  MessageButton,
  MessageEditOptions,
  MessageEmbed,
  NewsChannel,
  Snowflake,
  TextChannel,
} from "discord.js";
import {
  staticImplements,
  ICommandPluginClass,
  CommandError,
} from "../../types/DissidiumPlugin";
import ButtonInteractionPlugin from "../buttonCommands";
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
  options: {
    [roleId: Snowflake]: RoleselectorOption;
  };
};

/**
 * Represents a button in a role selector
 */
type RoleselectorOption = {
  emoji?: string;
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
@staticImplements<
  ICommandPluginClass<[DatabasePlugin, MessageCommand, ButtonInteractionPlugin]>
>()
export default class RoleselectorCommandPlugin {
  static pluginName = "command-roleselector";
  static dependencies = ["database", "command-message", "buttonInteraction"];

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
            .addStringOption(so =>
              so
                .setName("button-emoji")
                .setDescription(
                  "The emoji prepending the button label for the given role."
                )
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
   * Formats a role selector option to a string unique to the given config.
   *
   * @param configName The name of the config the option resides in
   * @param roleId The ID of the role the user gets assigned if it chooses the given option
   * @returns An ID string to pass to `setButtonListener`
   */
  private getLocalButtonId = (configName: string, roleId: Snowflake) =>
    configName + ":" + roleId;

  private createRoleselectorButtons = async (
    channel: TextChannel | NewsChannel,
    configName: string,
    roleselector: RoleselectorConfig
  ) => {
    // Create button row(s)
    const messageComponents = [];
    let buttonCount = 0;
    for (const roleId in roleselector.options) {
      const option = roleselector.options[roleId];
      const localId = this.getLocalButtonId(configName, roleId);

      // Register button interaction
      const customId = this.btnInteraction.setButtonListener(
        this,
        localId,
        this.handleButtonInteraction
      );

      // Fallback label to role name if no specific label is assigned
      let { label } = option;
      if (!label) {
        const role = await channel.guild.roles.fetch(roleId);
        label = role?.name ?? "<ROLE DELETED>";
      }

      // Create base button
      const btn = new MessageButton()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle("SECONDARY");

      // Add emoji to button, if it exists
      const { emoji } = option;
      if (emoji) btn.setEmoji(emoji);

      // An action row can only have 5 elements
      if (buttonCount % 5 === 0) messageComponents.push(new MessageActionRow());
      messageComponents.at(-1)?.addComponents(btn);

      buttonCount++;
    }

    return messageComponents;
  };

  /**
   * Assigns a role selector to the given channel and posts the accompanying message and options.
   *
   * @param channel The channel to post the role selector into
   * @param configName The unique identifier of the role selector
   * @param roleselector The config object of the role selector
   * @returns The message that was posted
   */
  private postRoleselector = async (
    channel: NewsChannel | TextChannel,
    configName: string,
    roleselector: RoleselectorConfig
  ) => {
    const messageData = await this.messager.fetchMessageObject(
      channel.guildId,
      roleselector.messageName
    );

    // Create button row(s)
    const messageComponents = await this.createRoleselectorButtons(
      channel,
      configName,
      roleselector
    );

    // Send message
    return await channel.send({ ...messageData, components: messageComponents });
  };

  /**
   * Updates the role selector options on an already posted message
   *
   * @param guild The guild the role selector belongs to
   * @param configName The unique identifier of the role selector
   * @param roleselector The config object of the role selector
   * @returns The message that was edited
   */
  private repostRoleselector = async (
    guild: Guild | null,
    configName: string,
    roleselector: RoleselectorConfig,
    shouldUpdateMessage = false
  ) => {
    // Only proceed if there is anything to remove
    if (!roleselector.observable) return;
    if (!guild)
      throw new CommandError("Could not establish connection to guild services", true);

    // Fetch message object or halt if it doesn't exist
    const channel = await guild.channels.fetch(roleselector.observable.channelId);
    if (!channel || !channel.isText()) return;
    const message = await channel.messages.fetch(roleselector.observable.messageId);
    if (!message) {
      roleselector.observable = null;
      await this.db.save();
      throw new CommandError(
        "The message to which the role selector is currently assigned, does not exist (anymore)."
      );
    }

    // Retrieve message data to update the role selector with
    let messageData: MessageEditOptions = {};
    if (shouldUpdateMessage) {
      if (!roleselector.messageName)
        throw new CommandError("No message is paired to the given role selector");
      messageData = await this.messager.fetchMessageObject(
        guild.id,
        roleselector.messageName
      );
    }

    // Unregister current buttons
    for (const row of message.components) {
      for (const button of row.components) {
        if (button.customId) this.btnInteraction.removeButtonListener(button.customId);
      }
    }

    // Create new button row(s)
    const messageComponents = await this.createRoleselectorButtons(
      channel,
      configName,
      roleselector
    );

    // Swap out components
    return await message.edit({ ...messageData, components: messageComponents });
  };

  /**
   * Deletes the role selector message and options from the given channel.
   *
   * @param guild The guild the role selector belongs to
   * @param configName The unique identifier of the role selector
   * @param roleselector The config object of the role selector
   */
  private unpostRoleselector = async (
    guild: Guild | null,
    configName: string,
    roleselector: RoleselectorConfig
  ) => {
    // Only proceed if there is anything to remove
    if (!roleselector.observable) return;
    if (!guild)
      throw new CommandError("Could not establish connection to guild services", true);

    // Fetch message object or halt if it doesn't exist
    const channel = await guild.channels.fetch(roleselector.observable.channelId);
    if (!channel || !channel.isText()) return;
    if (!roleselector.observable) return;
    const message = await channel.messages.fetch(roleselector.observable.messageId);
    if (!message) return;

    // Remove message
    if (!(await message.delete()))
      throw new CommandError("Could not delete message. Do I have enough permissions?");

    // Remove button listeners as they are not needed anymore
    for (const roleId in roleselector.options) {
      const localId = this.getLocalButtonId(configName, roleId);
      this.btnInteraction.removeButtonListener(this, localId);
    }
  };

  /**
   * A listener for button interactions. This is only invoked if a button registered by this class was pressed.
   * Hence, we can assuredly tell what its customId is going to look like.
   *
   * @param interaction A live button interaction object from Discord.js that is guaranteed to come from a guild
   */
  private handleButtonInteraction = async (interaction: ButtonInteraction<CacheType>) => {
    console.log("Invoked button with id: " + interaction.customId);
    await interaction.reply({ ephemeral: true, content: "Holy crap, Lois, it worked!" });
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
      options: {},
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
    const { guildId, guild } = interaction;
    const configName = this.getConfigName(interaction);

    // Retrieving all role selector configs for the given guild
    const roleselectors = await this.getRoleselectors(guildId);
    const roleselector = roleselectors[configName];

    // Make sure config with the given name exists
    if (typeof roleselector === "undefined")
      throw new CommandError(
        `There is no role selector configuration called "${configName}".`
      );

    // Remove message if the role selector has been posted
    await this.unpostRoleselector(guild, configName, roleselector);

    // Remove config from database
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
      for (const roleId in roleselector.options) {
        const emoji = roleselector.options[roleId].emoji;
        let label = roleselector.options[roleId].label;

        // Retrieve role from guild cache
        const role = await interaction.guild.roles.fetch(roleId);
        const roleName: string = role?.name ?? `_<DELETED ROLE>_`;

        // Making sure to always show some type of label to the user
        if (!label) label = roleName;
        if (emoji) label = `${emoji} ` + label;

        formattedRoleList.push(`​    • ${label} - [Role: \`${roleName}\`]`);
      }

      configList.push(headerText + "\n" + formattedRoleList.join("\n") + "\n");
    }

    const description =
      configList.length > 0
        ? configList.join("\n")
        : "There are currently 0 configurations in this guild. Create one with `/roleselector add` first.";

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
    const { guildId, guild, options } = interaction;
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
      for (const roleId in roleselector.options) {
        const fetchedRole = await interaction.guild?.roles.fetch(roleId);

        if (!fetchedRole) {
          delete roleselector.options[roleId];
          staleCount++;
        }
      }

      // Only update if anything stale was found
      if (!staleCount)
        throw new CommandError(
          `There are no stale roles as options in the role selector "${configName}".`
        );

      // Update message buttons
      await this.repostRoleselector(guild, configName, roleselector);

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
      const buttonEmoji = options.getString("button-emoji", false) || undefined;

      if (Object.keys(roleselector.options).length >= 25)
        throw new CommandError("A role selector can't have more than 25 options.");

      roleselector.options[role.id] = { emoji: buttonEmoji, label: buttonLabel };
      await this.db.save();

      // Update message buttons
      await this.repostRoleselector(guild, configName, roleselector);

      await interaction.reply(
        `✅ Successfully added role "${role.name}" as an option to the selector "${configName}"!`
      );
      return;
    }

    if (subcommand === "remove") {
      if (typeof roleselector.options[role.id] !== "object")
        throw new CommandError(
          `Role "${role.name}" is not listed as an option in the selector "${configName}".`
        );

      delete roleselector.options[role.id];
      await this.db.save();

      // Update message buttons
      await this.repostRoleselector(guild, configName, roleselector);

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
    const { guildId, guild, options } = interaction;
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

    // Update message content and buttons
    await this.repostRoleselector(guild, configName, roleselector, true);

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
    const { guildId, guild, options } = interaction;
    const subcommand = options.getSubcommand(true);
    const configName = this.getConfigName(interaction);

    const roleselectors = await this.getRoleselectors(guildId);
    const roleselector = roleselectors[configName];

    // Make sure config with the given name exists
    if (typeof roleselector === "undefined")
      throw new CommandError(
        `There is no role selector configuration called "${configName}".`
      );

    // Make sure the guild is in cache
    if (!interaction.guild)
      throw new CommandError(
        "Unable to connect to guild services. Please try again later.",
        false
      );

    if (subcommand === "set") {
      const { id: channelId } = interaction.options.getChannel("channel", true);
      const channel = await interaction.guild.channels.fetch(channelId);
      if (!channel) throw new CommandError("Channel not found.");
      if (!channel.isText()) throw new CommandError("Channel is not a text-channel.");

      // Remove from old channel and unregister old buttons if needed
      await this.unpostRoleselector(guild, configName, roleselector);

      // Add to new channel
      const message = await this.postRoleselector(channel, configName, roleselector);
      roleselector.observable = {
        channelId: channel.id,
        messageId: message.id,
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

      // Remove message from channel and unregister buttons
      await this.unpostRoleselector(guild, configName, roleselector);

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

  constructor(
    private db: DatabasePlugin,
    private messager: MessageCommand,
    private btnInteraction: ButtonInteractionPlugin
  ) {}

  /**
   * Starts listening to all role selectors
   * which have a message posted somewhere already.
   *
   * It's like adding water to a cake mix...
   */
  private hydrateRoleselectors = async () => {
    const guildIds = this.db.getRelevantGuilds();
    for (const guildId of guildIds) {
      const guild = this.btnInteraction.fetchGuild(guildId);
      if (!guild || !guild.available) {
        console.log(
          "Roleselector Hydration:",
          "Guild id not in cache or unavailable:",
          guildId
        );
        continue;
      }

      // Make sure each visible role selector is re-registered
      const roleselectors = await this.getRoleselectors(guildId);
      for (const configName in roleselectors) {
        const config = roleselectors[configName];
        if (!config) continue;
        if (!config.observable) continue;

        // Make sure observable has not been deleted
        try {
          const channel = await guild.channels.fetch(config.observable.channelId);
          if (!channel || !channel.isText()) throw new Error("Channel does not exist");
          const message = await channel.messages.fetch(config.observable.messageId);
          if (!message) throw new Error("Message does not exist");
        } catch (err) {
          console.log("Roleselector Hydration:", "Cannot obtain observable:", err);
          config.observable = null;
          continue;
        }

        // Re-Register all button listeners
        for (const roleId in config.options) {
          const localId = this.getLocalButtonId(configName, roleId);
          this.btnInteraction.setButtonListener(
            this,
            localId,
            this.handleButtonInteraction
          );
        }
      }
    }
  };

  start = async () => await this.hydrateRoleselectors();
  stop = async () => {};
}
