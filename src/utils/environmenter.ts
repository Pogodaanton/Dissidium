import { config as configurateDotenv } from "dotenv";

export const config = {
  token: "",
  guildId: "",
  clientId: "",
};

export function initConfig() {
  // Config dotenv
  configurateDotenv();

  // Config error checking
  if (!process.env.TOKEN) {
    console.error(
      "You have no token set, make sure to create an .env file first! Aborting..."
    );
    process.exit(1);
  }

  config.token = process.env.TOKEN;

  if (!process.env.GUILD_ID) {
    console.error("You have no guild id set (GUILD_ID)! Aborting...");
    process.exit(1);
  }

  config.guildId = process.env.GUILD_ID;

  if (!process.env.CLIENT_ID) {
    console.error("You have no application client id set (CLIENT_ID)! Aborting...");
    process.exit(1);
  }

  config.clientId = process.env.CLIENT_ID;
}
