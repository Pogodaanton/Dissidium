import { CommandPlugin } from "../../utils/PluginStructs";
import {
  ReactionCollector,
  CollectorFilter,
  Message,
  MessageEmbed,
  MessageReaction,
  User,
  Collection,
  Channel,
  TextChannel,
  DMChannel,
  NewsChannel,
  GuildMember,
} from "discord.js";
import schedule, { scheduleJob } from "node-schedule";
import DatabaseMan from "../databaseMan";
import { sendError } from "../../utils";

/**
 * A role-assigning bouncer algorithm.
 * Gives you a role based on the reaction you choose.
 */
export default class BouncerOptions extends CommandPlugin {
  command = "bouncer";
  description = "Let the bot provide users a list of optional roles to choose from.";
  usage = [
    "bouncer {set-channel|remove-channel} [CHANNEL-NAME]",
    "bouncer settings {add-role|remove-role} [EMOJI] [ROLE-NAME|-]",
  ];

  refreshJobScheduler: schedule.Job | null = null;

  embedList = new Collection<Channel, Message>();
  langSelectionCollectors = new Collection<Channel, ReactionCollector>();
  langSelectionTimeouts = new Collection<GuildMember, NodeJS.Timeout>();

  static dependencies = ["databaseMan"];
  databaseMan = this.bot.plugins.get("DatabaseMan") as DatabaseMan;

  /**
   * Used for determining whether we need to call the actual listener.
   *
   * @type {CollectorFilter}
   * @memberof BouncerOptions
   */
  langSelectionFilter: CollectorFilter = async (
    reaction: MessageReaction,
    user: User
  ): Promise<boolean> => {
    // Get all language roles and compare the reaction's emoji to the keys
    const availLangRoles =
      (await this.databaseMan.getGuildData<{ [key: string]: string }>(
        reaction.message.guild,
        "bouncer/langRoles"
      )) || {};
    const availEmojis = Object.keys(availLangRoles);

    // Users may only recieve a role if they don't have one currently.
    if (
      user.bot ||
      availEmojis.includes(reaction.emoji.name) ||
      (reaction.message.guild?.available &&
        typeof reaction.message.guild.member(user)?.roles.cache.size === "number" &&
        (reaction.message.guild.member(user)?.roles.cache.size as number) > 1)
    ) {
      return false;
    }

    return true;
  };

  /**
   * Assigning role with 2s changing time
   */
  onLangSelect = async (reaction: MessageReaction, user: User): Promise<void> => {
    const { message, emoji } = reaction;
    const { guild } = message;
    if (!guild) return;
    const member = guild.member(user);
    if (!member) return;

    // Clear timeout of previous selection
    const oldTimeout = this.langSelectionTimeouts.get(member);
    if (typeof oldTimeout !== "undefined") clearTimeout(oldTimeout);

    // If the user has unselected, we don't need to initiate another timeout
    if (typeof reaction.users.cache.find(val => val === user) === "undefined") return;

    // Find other reactions the user has selected and remove them
    message.reactions.cache
      .filter(
        val =>
          val.emoji !== emoji &&
          typeof val.users.cache.find(value => value === user) !== "undefined"
      )
      .forEach(otherReaction => {
        otherReaction.users.remove(user);
      });

    const timeout = setTimeout(async () => {
      const desiredRoleID =
        (await this.databaseMan.getGuildData<string>(
          guild,
          "bouncer/langRoles/" + emoji.name
        )) || "";
      const desiredRole = guild.roles.cache.find(role => role.id === desiredRoleID);

      if (!desiredRole) {
        sendError(message, `Could not find role \`${desiredRoleID}\`.`);
        return;
      }

      try {
        const member = guild.member(user);
        if (!member || member?.roles.cache.size > 1) return;
        await member.roles.add(desiredRole);
      } catch (err) {
        sendError(message, `Could not assign role: ${err.toString()}.`);
        console.error(err);
      }
    }, 2000);

    this.langSelectionTimeouts.set(member, timeout);
  };

  /**
   * Compiles the arguments the user sent alongside `set-channel` and `remove-channel`
   * in order to then determine the text-channel which the user wishes the bot to use
   *
   * @memberof BouncerOptions
   */
  getLangChannelFromArgs = (msg: Message, args: string[]): TextChannel | null => {
    const checkChannel = (
      chn: TextChannel | DMChannel | NewsChannel
    ): chn is TextChannel => chn.type === "text";
    let proposedChannel = msg.channel;

    if (args.length > 0) {
      const proposedChannelName = args.join(" ").trim();
      const foundChannel = msg.guild?.channels.cache.find(
        chn => chn.name === proposedChannelName && chn.type === "text"
      );

      if (typeof foundChannel !== "undefined") {
        proposedChannel = foundChannel as TextChannel;
      }
    }

    if (!checkChannel(proposedChannel)) {
      return null;
    } else {
      return proposedChannel;
    }
  };

  setLangChannel = async (msg: Message, args: string[]): Promise<void> => {
    const { guild, channel } = msg;
    if (!guild) return;

    const proposedChannel = this.getLangChannelFromArgs(msg, args);
    if (!proposedChannel) {
      sendError(msg, "You can't do this here. Use a server text-channel instead.");
      return;
    }

    const langSelChannels = await this.databaseMan.getGuildData<string[]>(
      guild,
      "bouncer/langSelChannels"
    );
    if (langSelChannels && langSelChannels.includes(proposedChannel.id)) {
      sendError(
        msg,
        'You already have this text-channel assigned. To recreate the message please use "remove-channel" first.'
      );
      return;
    }

    const langRoles =
      (await this.databaseMan.getGuildData<{ [key: string]: string }>(
        guild,
        "bouncer/langRoles"
      )) || {};
    if (Object.keys(langRoles).length <= 0) {
      sendError(
        msg,
        "You don't have any language roles assigned currently.\n" +
          "Please use `bouncer settings add-language` first."
      );
      return;
    }

    try {
      await this.databaseMan.setGuildData(
        guild,
        "bouncer/langSelChannels[]",
        proposedChannel.id
      );
    } catch (err) {
      sendError(msg, err);
      return;
    }

    const embedTemplate = new MessageEmbed()
      .setColor("#000")
      .setTitle(":wave::wave_tone1::wave_tone2::wave_tone3::wave_tone4::wave_tone5:")
      .addFields(
        {
          name: "Welcome to our server!",
          value: "In order to proceed, please choose your preferred language below.",
          inline: true,
        },
        {
          name: "Üdv. a szerverünkön!",
          value: "A továblépéshez kérünk válaszd ki a elsődleges nyelvedet.",
          inline: true,
        },
        {
          name: "Willkommen auf unserem Server!",
          value:
            "Bevor du eintrittst, bitten wir dich, deine bevorzugte Sprache auszuwählen.",
          inline: true,
        }
      );

    try {
      const embed = await channel.send(embedTemplate);
      this.embedList.set(channel, embed);

      // Generate reactions
      Object.keys(langRoles).forEach(key => embed.react(key));

      const collector = embed.createReactionCollector(this.langSelectionFilter);
      collector.on("collect", this.onLangSelect);
      this.langSelectionCollectors.set(channel, collector);
    } catch (err) {
      console.error("Lang-selection embed creation was unsuccessful!\n", err);
      return;
    }

    msg.react("✅");
  };

  removeLangChannel = async (msg: Message, args: string[]): Promise<void> => {
    const { guild } = msg;
    if (!guild) return;
    const proposedChannel = this.getLangChannelFromArgs(msg, args);

    if (!proposedChannel) {
      sendError(msg, "You can't do this here. Use a server text-channel instead.");
      return;
    }

    try {
      await this.databaseMan.deleteGuildData(
        guild,
        "bouncer/langSelChannels",
        proposedChannel.id
      );
      msg.react("✅");
    } catch (err) {
      sendError(msg, err);
    }

    const embed = this.embedList.get(proposedChannel);
    const collector = this.langSelectionCollectors.get(proposedChannel);

    if (typeof embed !== "undefined" && embed.deletable) {
      embed.delete();
    }

    if (typeof collector !== "undefined") collector.off("collect", this.onLangSelect);
  };

  addLangRole = async (msg: Message, args: string[]): Promise<void> => {
    const [emoji] = args;
    const { guild } = msg;
    if (!guild) return;

    // First arg is emoji, combine rest of args, since a role can have spaces inbetween
    args.shift();
    const roleName = args.join(" ").trim();
    const role = guild.roles.cache.find(r => r.name === roleName);

    // Verify role name
    if (!role) {
      sendError(msg, "Specified role not found!");
      return;
    }

    try {
      await this.databaseMan.setGuildData(guild, "bouncer/langRoles/" + emoji, role.id);
      msg.react("✅");
    } catch (err) {
      sendError(msg, err);
    }
  };

  removeLangRole = async (msg: Message, args: string[]): Promise<void> => {
    const [emoji] = args;
    const { guild } = msg;
    if (!guild) return;

    try {
      await this.databaseMan.deleteGuildData(guild, "bouncer/langRoles/" + emoji);
      msg.react("✅");
    } catch (err) {
      sendError(msg, err);
    }
  };

  getSettingsArg = async (msg: Message, args: string[]): Promise<void> => {
    switch (args.shift()?.toLowerCase()) {
      case "add-langrole":
        return this.addLangRole(msg, args);

      case "remove-langrole":
        return this.removeLangRole(msg, args);

      default:
        return;
    }
  };

  execute = async (msg: Message, args: string[], sendHelp: () => void): Promise<void> => {
    switch (args.shift()?.toLowerCase()) {
      case "set-channel":
        return this.setLangChannel(msg, args);
      case "remove-channel":
        return this.removeLangChannel(msg, args);
      case "settings":
        return this.getSettingsArg(msg, args);
      default:
        return sendHelp();
    }
  };

  refreshBouncers = async (): Promise<void> => {
    for (const embed of this.embedList.array()) {
      try {
        embed.reactions.removeAll();
        embed.react("🇬🇧");
        embed.react("🇦🇹");
        embed.react("🇭🇺");
        embed.react("🇩🇪");
      } catch (err) {
        console.error("Refreshing lang select embed was unsuccessful!", err);
      }
    }
  };

  load = (): void => {
    this.registerCommand();
    this.refreshJobScheduler = scheduleJob("0 0 * * *", this.refreshBouncers);
  };

  unload = async (): Promise<void> => {
    if (this.refreshJobScheduler) {
      this.refreshJobScheduler.cancel();
    }

    for (const embed of this.embedList.array()) {
      try {
        await embed.delete();
      } catch (err) {
        console.error("Deleting lang select embed was unsuccessful!", err);
      }
    }

    for (const collector of this.langSelectionCollectors.array()) {
      collector.off("collect", this.onLangSelect);
    }
  };
}
