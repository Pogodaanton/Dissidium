/* eslint-disable @typescript-eslint/no-empty-function */
import { SlashCommandBuilder } from "@discordjs/builders";
import {
  ApplicationCommandPermissionData,
  CacheType,
  CommandInteraction,
  Guild,
  GuildApplicationCommandPermissionData,
  MessageEmbed,
  Snowflake,
} from "discord.js";
import { DissidiumConfig } from "../../types/Dissidium";
import {
  staticImplements,
  ICommandPluginClass,
  CommandError,
} from "../../types/DissidiumPlugin";
import CommandInteractionPlugin from "../commands";
import DatabasePlugin from "../database";

@staticImplements<
  ICommandPluginClass<[DatabasePlugin, CommandInteractionPlugin, DissidiumConfig]>
>()
export default class OperatorsCommandPlugin {
  static pluginName = "command-op";
  static dependencies = ["database", "commandInteraction", "config"];

  commandName = "op";
  data = new SlashCommandBuilder()
    .setName("op")
    .setDefaultPermission(false)
    .setDescription(
      "Assign and remove bot operators who receive permissions to the remaining commands."
    )
    .addSubcommand(sc =>
      sc
        .setName("add")
        .setDescription("Assign a user as a bot operator")
        .addUserOption(uo =>
          uo
            .setName("user")
            .setDescription("The user to assign as a bot operator")
            .setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc
        .setName("remove")
        .setDescription("Remove a user from the list of bot operator")
        .addUserOption(uo =>
          uo.setName("user").setDescription("The user to unassign").setRequired(true)
        )
    )
    .addSubcommand(sc =>
      sc.setName("list").setDescription("List the currently assigned bot operators.")
    );

  /**
   * Changes the command permissions of this bot in a given guild,
   * so that the bot owner, the guild owner as well as all
   * additionally assigned operators can use all commands
   *
   * @param guild The guild in which the permissions should be updated
   */
  redeployOperators = async (guild: Guild) => {
    const guildCommandIds = this.commander.guildCommandIds.get(guild.id);
    if (!guildCommandIds)
      throw new CommandError("The given guild has no command ids cached.", true);

    // Bot and guild owner will always be operators
    const dbOps = await this.db.getGuildData<Snowflake[]>(guild.id, "ops", []);
    const ops = [...dbOps, this.config.ownerUserId];

    // Add guild owner if it differs from bot owner
    if (this.config.ownerUserId !== guild.ownerId) ops.push(guild.ownerId);

    // Create list of permitted users
    const permittedUsers: ApplicationCommandPermissionData[] = [];
    for (const userId of ops)
      permittedUsers.push({
        id: userId,
        type: "USER",
        permission: true,
      });

    // Append list of permitted users to each command
    const perms: GuildApplicationCommandPermissionData[] = [];
    for (const cmdId of guildCommandIds.values())
      perms.push({
        id: cmdId,
        permissions: permittedUsers,
      });

    guild.commands.permissions.set({ fullPermissions: perms });
  };

  /**
   * Executes each time a user uses the add slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onAddCommand = async (interaction: CommandInteraction<CacheType>) => {
    await interaction.deferReply();
    if (!interaction.inCachedGuild())
      throw new CommandError("Could not establish connection to guild services.");

    const user = interaction.options.getUser("user", true);

    // Deny certain user assignments
    if (user.bot) throw new CommandError("Cannot assign bots to operators.");
    if (user.id === interaction.guild.ownerId)
      throw new CommandError("The guild owner is already an operator.");
    if (user.id === this.config.ownerUserId)
      throw new CommandError("The bot owner is already an operator.");

    // Write to database
    const ops = await this.db.getGuildData<Snowflake[]>(interaction.guildId, "ops", []);
    ops.push(user.id);
    await this.db.save();

    // Redeploy operators
    this.redeployOperators(interaction.guild);

    await interaction.editReply(
      `✅ Successfully added user "${user.username}" to the list of operators!`
    );
  };

  /**
   * Executes each time a user uses the remove slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onRemoveCommand = async (interaction: CommandInteraction<CacheType>) => {
    await interaction.deferReply();
    if (!interaction.inCachedGuild())
      throw new CommandError("Could not establish connection to guild services.");

    const user = interaction.options.getUser("user", true);

    // Deny certain user assignments
    if (user.bot) throw new CommandError("Cannot assign bots to operators.");
    if (user.id === interaction.guild.ownerId)
      throw new CommandError("The guild owner is already an operator.");
    if (user.id === this.config.ownerUserId)
      throw new CommandError("The bot owner is already an operator.");

    // Make sure user is an operator
    const ops = await this.db.getGuildData<Snowflake[]>(interaction.guildId, "ops", []);
    const idx = ops.findIndex(userId => userId === user.id);
    if (idx < 0) throw new CommandError("User is currently not an operator.");

    // Remove user id from list
    ops.splice(idx, 1);
    await this.db.save();

    // Redeploy operators
    this.redeployOperators(interaction.guild);

    await interaction.editReply(
      `✅ Successfully removed user "${user.username}" from the list of operators!`
    );
  };

  /**
   * Executes each time a user uses the list slash command.
   *
   * @param interaction A live interaction object from Discord.js that is guaranteed to come from a guild
   */
  onListCommand = async (interaction: CommandInteraction<CacheType>) => {
    await interaction.deferReply();
    if (!interaction.inCachedGuild())
      throw new CommandError("Could not establish connection to guild services.");

    // We also show the default operators in the list (guild and bot owner)
    const dbOps = await this.db.getGuildData<Snowflake[]>(interaction.guildId, "ops", []);
    const ops = [...dbOps, this.config.ownerUserId];

    // Add guild owner if it differs from bot owner
    if (this.config.ownerUserId !== interaction.guild.ownerId)
      ops.push(interaction.guild.ownerId);

    const lines: string[] = [];
    for (const userId of ops) {
      const user = await interaction.guild.members.fetch(userId);
      lines.push(
        `- ${user ? user.nickname || user.displayName : "<User left this server>"}`
      );
    }

    interaction.editReply({
      embeds: [
        new MessageEmbed({
          title: "List of bot operators",
          description:
            lines.length > 0 ? lines.join("\n") : "No bot operators explicitly assigned.",
          footer: {
            text: "Note: The bot owner and the guild owner are always operators",
          },
        }),
      ],
    });
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
      case "add":
        await this.onAddCommand(interaction);
        break;

      case "remove":
        await this.onRemoveCommand(interaction);
        break;

      case "list":
        await this.onListCommand(interaction);
        break;

      default:
        throw new CommandError("Please use the available sub-commands.");
    }
  };

  constructor(
    private db: DatabasePlugin,
    private commander: CommandInteractionPlugin,
    private config: DissidiumConfig
  ) {}

  /**
   * Listener that is invoked if a new guild accepted the registration of this bot's commands.
   *
   * @param guildId The ID of the guild to send the permission changes to
   */
  onGuildCommandDeployed = async (guildId: string) => {
    try {
      const guild = await this.commander.fetchGuild(guildId);
      if (!guild) return;

      this.redeployOperators(guild);
    } catch (err) {
      console.error("operators", `onGuildCommandDeployed(${guildId})`, "error:", err);
    }
  };

  start = async () => {
    this.commander.events.on("guild-commands-deployed", this.onGuildCommandDeployed);
  };

  stop = async () => {
    this.commander.events.off("guild-commands-deployed", this.onGuildCommandDeployed);
  };
}
