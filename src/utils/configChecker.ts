import fs from "fs";
import { resolve } from "path";

/**
 * Global config path
 */
const configPath = resolve(__dirname, "../config.json");

/**
 * Typings for config.json
 */
type ConfigFile = {
  /**
   * Command prefix
   * @example "!"
   */
  prefix: string;
  /**
   * Discord bot authentication token
   */
  token: string;
  langRoles: {
    [key: string]: string;
  };
};

const configDefaults = {
  prefix: "!",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stopWithError(err: any) {
  console.error("A fatal error happened while requesting Dissidium's config.");
  console.error(err);
  process.exit(9);
}

/**
 * Makes sure necessary config values are assigned
 */
function checkMissingObligatories(obj: Record<string, unknown>) {
  const obligatoryItems: { key: string; type: string }[] = [
    { key: "token", type: "string" },
    { key: "prefix", type: "string" },
  ];

  obligatoryItems.forEach(obligatory => {
    if (typeof obj[obligatory.key] !== obligatory.type) {
      stopWithError(
        `Missing config option or wrong type: ${obligatory.key} (${obligatory.type})`
      );
    }
  });
}

export const writeConfig = (cfg: ConfigFile): void => {
  if (!fs.existsSync(configPath)) {
    stopWithError("We don't recommend you using this function to create the config.");
  }

  fs.writeFileSync(configPath, JSON.stringify(cfg));
};

export default (): ConfigFile => {
  if (!fs.existsSync(configPath)) {
    stopWithError(
      'You need to create a config.json in "src" first! \
There is a sample file called "config.sample.json" which you can modify and save as config.json.'
    );
  }

  let cfgFile: ConfigFile = JSON.parse(fs.readFileSync(configPath, "utf8"));
  cfgFile = { ...configDefaults, ...cfgFile };
  checkMissingObligatories(cfgFile);

  // Avoid bad prefixes
  if (cfgFile["prefix"] == "@")
    stopWithError(
      "The currently selected command prefix cannot be used. Please change it in the config file."
    );

  // Append defaults
  return cfgFile;
};
