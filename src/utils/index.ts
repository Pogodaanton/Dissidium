import { Guild, Message, TextChannel } from "discord.js";

export const sendError = (
  message: Message,
  errorMessage: string,
  cooldown = 10
): void => {
  message.channel.send(`:x: ${errorMessage}`).then(msg => {
    if (cooldown > 0 && msg.deletable) msg.delete({ timeout: cooldown * 1000 });
  });
};

export const findChannel = (guild: Guild | null, channelName: string): TextChannel => {
  const foundChannel = guild?.channels.cache.find(
    chn => chn.name === channelName && chn.type === "text"
  );

  if (!foundChannel || typeof foundChannel === "undefined")
    throw new Error("Channel with the given name could not be found.");

  return foundChannel as TextChannel;
};
