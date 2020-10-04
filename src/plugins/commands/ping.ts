import { CommandPlugin } from "../../utils/PluginStructs";
import { Message } from "discord.js";

/**
 * A ping pong script, whenever you send "ping", it replies with "pong".
 */
export default class Ping extends CommandPlugin {
  command = "ping";
  description = "Pong.";
  adminOnly = false;

  execute = (message: Message): void => {
    const pingText = message.content.split(" ")[0];
    message.channel.send(pingText.substr(1).replace("i", "o").replace("I", "O") + "!");
  };
}
