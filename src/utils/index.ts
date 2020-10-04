import { Message } from "discord.js";

export const sendError = (
  message: Message,
  errorMessage: string,
  cooldown = 10
): void => {
  message.channel.send(`:x: ${errorMessage}`).then(msg => {
    if (cooldown > 0 && msg.deletable) msg.delete({ timeout: cooldown * 1000 });
  });
};
