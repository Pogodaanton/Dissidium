const { build } = require("esbuild");
const path = require("path");
const pkg = require(path.resolve("./package.json"));

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
];

const shouldWatch = process.env.WITH_WATCH == 1;

async function start() {
  // Dynamic resolving of plugins
  // Plugins should not be bundled to retain them modular
  const { globby } = await import("globby");
  const pluginFiles = await globby(["./src/plugins/**/**.ts"]);

  try {
    await build({
      platform: "node",
      bundle: true,
      minify: false,
      sourcemap: false,
      format: "cjs",
      target: "node16",
      entryPoints: [...pluginFiles, "./src/index.ts"],
      outdir: "./dist",
      watch: shouldWatch
        ? {
            onRebuild(error, result) {
              if (error)
                console.error(
                  new Date().toLocaleTimeString() + " > watch build failed!!!!!!!!!!!!!!"
                );
              else
                console.log(new Date().toLocaleTimeString() + " > watch build succeeded");
            },
          }
        : false,
      external,
    });

    if (shouldWatch)
      console.log(
        "\nListening for file changes in src directory...\n\n            [Use ^C to exit...]\n"
      );
  } catch (err) {
    process.exit(1);
  }
}

start();