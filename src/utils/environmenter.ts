import { config as configurateDotenv } from "dotenv";
import { DissidiumConfig } from "../types/Dissidium";

const config: DissidiumConfig = {
  token: "",
  testGuildId: "",
  ownerUserId: "",
  clientId: "",
};

export function initConfig() {
  // Config dotenv
  configurateDotenv();

  // Config error checking
  if (!process.env.TOKEN) {
    console.error(
      "You have no token set, make sure to create an .env file first. Aborting..."
    );
    process.exit(1);
  }

  config.token = process.env.TOKEN;

  if (!process.env.TEST_GUILD_ID) {
    console.error(
      "You have no test guild ID set in your .env file (TEST_GUILD_ID). Aborting..."
    );
    process.exit(1);
  }

  config.testGuildId = process.env.TEST_GUILD_ID;

  if (!process.env.CLIENT_ID) {
    console.error(
      "Please put the bot's user ID in your .env file (CLIENT_ID). Aborting..."
    );
    process.exit(1);
  }

  config.clientId = process.env.CLIENT_ID;

  if (!process.env.OWNER_USER_ID) {
    console.error(
      "Please mention your user ID in your .env file (OWNER_USER_ID). Aborting..."
    );
    process.exit(1);
  }

  config.ownerUserId = process.env.OWNER_USER_ID;

  return config;
}
