import { CommandPlugin } from "../../utils/PluginStructs";
import { EmbedField, Message, MessageEmbed, MessageEmbedOptions } from "discord.js";

/**
 * The help stack for printing help messages and managing the !help command.
 */
export default class Help extends CommandPlugin {
  command = "help";
  aliases = ["h"];
  description = "List available commands, their use-cases and their syntaxes.";
  adminOnly = true;

  /**
   * Sends a standardized MessageEmbed for help dialogs.
   * Its content can be adjusted through the options parameter.
   *
   * @param message A message object to send the response with
   * @param options Custom options for the MessageEmbed
   * @param compact Uses less whitespace to achieve a more compact view
   */
  private sendHelpEmbed = async (
    message: Message,
    options: MessageEmbedOptions,
    compact = false
  ): Promise<Message> => {
    return message.channel.send(
      new MessageEmbed({
        ...options,
        author: {
          name: `❓ ${this.config.prefix}help`,
        },
        description: options.description
          ? options.description + (compact ? "" : "\n​")
          : "",
      })
    );
  };

  /**
   * Sends an overview of a given command
   *
   * @param message A message object to send the response with
   * @param proposedCommand An array or string with the command name and (if available) its arguments
   */
  sendCommandHelp = (message: Message, proposedCommand: string[] | string): void => {
    const { prefix } = this.config;
    if (proposedCommand.length <= 0) return;

    /**
     * The name of the given command. Does not contain its arguments.
     */
    const commandName =
      typeof proposedCommand == "string"
        ? proposedCommand.split(" ")[0]
        : proposedCommand[0];

    /**
     * The command plugin object
     */
    const cmd =
      this.bot.commands.get(commandName) ||
      this.bot.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!cmd) {
      this.sendHelpEmbed(
        message,
        {
          title: `Couldn't find command \`${prefix + commandName}\``,
          description: `You can retrieve a list of all available commands by using \`${prefix}help\`.`,
          color: 12725549,
        },
        true
      );
      return;
    }

    const fields: EmbedField[] = [];

    // Local constants for the plugin's properties
    const { description, aliases, usage, adminOnly } = cmd;

    // Additional fields depending on what values are available in a given command plugin
    if (aliases && aliases.length > 0)
      fields.push({
        name: "Aliases:",
        value: aliases.map(alias => prefix + alias).join(", "),
        inline: false,
      });
    if (usage && usage.length > 0)
      fields.push({
        name: "Usage Examples:",
        value: usage
          .map(syntax => {
            const example = typeof syntax == "string" ? syntax : syntax.example;
            const description = typeof syntax == "string" ? "" : syntax.description;

            // Return syntax example and description, if available
            return (
              `\`${prefix + commandName} ${example}\`` +
              (description ? ` - _${description}_` : "")
            );
          })
          .join("\n"),
        inline: false,
      });
    if (!adminOnly)
      fields.push({
        name: "Permissions",
        value: "👥 This command may be used without special permissions",
        inline: false,
      });

    this.sendHelpEmbed(message, {
      title: `About ${prefix + commandName}`,
      description,
      fields,
    });
  };

  /**
   * Sends an overview of all registered commands in the system
   *
   * @param message A message object to send the response with
   */
  private sendGlobalHelp = (message: Message): void => {
    const { prefix } = this.config;

    const fields: EmbedField[] = this.bot.commands.array().map(
      (cmd): EmbedField => ({
        name:
          prefix +
          cmd.command +
          (cmd.aliases.length > 0 ? ` (${cmd.aliases.join(", ")})` : "") +
          (cmd.adminOnly ? "" : " 👥"),
        value: cmd.description || "No description available.",
        inline: true,
      })
    );

    this.sendHelpEmbed(message, {
      title: "List of all available commands",
      description: [
        "__Legend:__",
        "👥 .... Accessible without any permission",
        "(||​ ​​ ​||) .... Command aliases",
      ].join("\n"),
      //color: 1887400,
      footer: {
        // eslint-disable-next-line no-irregular-whitespace
        text: `​\nYou can call \`${prefix}help <command>\` to learn more about the commands use-cases and syntax.`,
      },
      fields,
    });
  };

  execute = (message: Message, args: string[]): void => {
    if (args.length <= 0) return this.sendGlobalHelp(message);
    return this.sendCommandHelp(message, args);
  };
}
