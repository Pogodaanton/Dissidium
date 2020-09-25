# CLI-TS-Template

This repository is a boilerplate for developing a node.js CLI using TypeScript. Additionally, it includes prettifier and eslint support out-of-the-box.

## Usage

The first-run script is `src/index.ts`. Make sure you keep the node-specific Shebang in the first line, so that the system is able to recognize it as a node.js executable.

You can assign a custom name to the executable by editing package.json:

```diff
  "scripts": {
    [...]
-   "myapp": "ts-node ./src/index.ts"
+   "[insert-app-name]": "ts-node ./src/index.ts"
  },
  "bin": {
-    "myapp": "./dist/index.js"
+    "[insert-app-name]": "./dist/index.js"
  },
```

## Available Scripts

In the project directory, you can run:

### `yarn [insert-app-name]`

Executes the CLI through `ts-node`, so that building isn't needed. It is advised to use this script during development if you need to try out the CLI.

### `yarn build`

Compiles TypeScript code into `./dist`. The generated files are ready to be packaged and shipped.

### `yarn lint`

Run ESLint through your `.ts` and `.js` files.
