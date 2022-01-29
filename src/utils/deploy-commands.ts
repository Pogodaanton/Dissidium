import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { config } from "./environmenter";
import fs from "fs/promises";
import path from "path";

export const commandDirPath = "./plugins/commands/";

export const getCommandFiles = async () => {
  const files = await fs.readdir(path.resolve(__dirname, commandDirPath));
  return files.filter(file => file.endsWith(".js"));
};

export default async function () {
  const commands = [];
  const commandFiles = await getCommandFiles();

  for (const file of commandFiles) {
    const {
      default: { default: command },
    } = await import(`${commandDirPath}${file}`);
    commands.push(command.data.toJSON());
  }

  const rest = new REST({ version: "9" }).setToken(config.token);

  rest
    .put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
      body: commands,
    })
    .then(() => console.log("Successfully registered application commands."))
    .catch(console.error);
}
