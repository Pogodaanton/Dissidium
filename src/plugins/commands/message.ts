import { CommandPlugin, UsageArray } from "../../utils/PluginStructs";
import { Message } from "discord.js";

/**
 * A wizard to greet new users and help them in retrieving roles.
 */
export default class MessageMan extends CommandPlugin {
  command = "message";
  description = "Allows to create bot messages for use in other modules.";
  usage: UsageArray = [
    {
      keywords: ["set"],
      example: "set <NAME> <URL>",
      description: "Assigns the message from a (valid) URL to the given name.",
      arguments: [
        {
          name: "<NAME>",
          description:
            "The identifier used to reference to this message. May only contain alphanumeric characters as well as `-` and `_`.",
        },
        {
          name: "<URL>",
          description: `A valid **short-link** from discohook.org. To learn more about generating said links, use \`${
            this.config.prefix + this.command
          } editor\`.`,
        },
      ],
    },
  ];

  execute = (message: Message): void => {
    message.toJSON();
  };
}
