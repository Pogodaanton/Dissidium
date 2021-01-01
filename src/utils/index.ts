import { Guild, GuildChannel, Message, Role, TextChannel } from "discord.js";

export const sendError = (
  message: Message,
  errorMessage: string,
  cooldown = 10
): void => {
  message.channel.send(`:x: ${errorMessage}`).then(msg => {
    if (cooldown > 0 && msg.deletable) {
      const timeout = cooldown * 1000;
      msg.delete({ timeout });
      setTimeout(() => message.react("❌"), timeout);
    }
  });
};

export const findChannel = (guild: Guild | null, channelName: string): TextChannel => {
  let foundChannel: GuildChannel | undefined;
  const matcher = /<#([0-9]*)>/g.exec(channelName);

  if (matcher) {
    foundChannel = guild?.channels.cache.get(matcher[1]);
  } else {
    foundChannel = guild?.channels.cache.find(
      chn => chn.name === channelName && chn.type === "text"
    );
  }

  if (!foundChannel || typeof foundChannel === "undefined")
    throw new Error("Channel with the given name could not be found.");

  return foundChannel as TextChannel;
};

export const isTextChannel = (channel: GuildChannel): channel is TextChannel => {
  return channel.type === "text";
};

export const findRole = (guild: Guild | null, roleName: string): Role => {
  let foundRole: Role | undefined;
  const matcher = /<@([0-9]*)>/g.exec(roleName);

  if (matcher) {
    foundRole = guild?.roles.cache.get(matcher[1]);
  } else {
    foundRole = guild?.roles.cache.find(role => role.name === roleName);
  }

  if (!foundRole || typeof foundRole === "undefined")
    throw new Error("Role with the given name could not be found.");

  return foundRole;
};

export const alphaNumericRegex = /[^A-Za-z0-9_-]/g;
