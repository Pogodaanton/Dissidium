# Dissidium

The Discord bot no one asked for. Configurable, modular and (hopefully) reliable.

## Prerequisites

- NodeJS version 20/LTS (consider using a version manager like `nvm` or `volta`)
- pnpm

## Getting Started

Before starting the bot for the first time, you will need to clone the repository, compile the TypeScript code and add a config file with your Discord authentication token. To successfully start the bot, you must follow all steps mentioned in the subsequent subsections.

### Set up the runtime environment

- Clone the repository
- Install dependencies via `pnpm install`
- Build the bot from source via `pnpm build/release`

> You will need to do these steps any time you update the bot.

### Adding a bot configuration file

Every bot on Discord needs an authentication token to identify itself with on the platform. You can learn more about obtaining a token over at the [Discord.JS guide pages](https://discordjs.guide/preparations/setting-up-a-bot-application.html).

In our case, the token is stored in the root directory (The folder that has the package.json file). Rename the provided `.env-sample` file to simply `.env` and edit its contents, so that `replace_this_with_token` is replaced with the bot token you retrieved from the Discord developer portal. (No leading or following whitespaces needed)

### Running the bot

If the aforementioned steps are done right, you should be able to run the bot via `pnpm start`.

## Feedback

You are welcome to share your thoughts on this bot over at [GitHub issues](https://github.com/Pogodaanton/Dissidium/issues).

## Development

While I don't expect any contributions, here are some of my thoughts to consider in no particular order:

- The baseline code in `src` should be kept simple and straightforward.
- Most new features should likely reside in the modular `plugins` directory.
- Plugins should be treated as separate modules. They may depend on other plugins, however, those need to be noted in the static `dependencies` array and retrieved through the constructor. Importing them manually is not advised.
- Make sure to use the provided `.prettierrc` for formatting

Esbuild's insane building speeds and the aggressive ratelimiting of Discord's APIs don't go well together. Therefore, the builder and runner processes were seperated:

- Run `pnpm watch` in the background to automatically rebuild the project on file change during development
- Run `pnpm start` to (re)start the bot process

If you are using VS Code:

- use the recommended extensions listed under the .vscode directory
- after installing them, you should be able to use the prewritten tasks listed under the .vscode directory

## License

MIT
