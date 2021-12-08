const { build } = require("esbuild");
const path = require("path");
const pkg = require(path.resolve("./package.json"));

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
];

const shouldWatch = process.env.WITH_WATCH == 1;

build({
  platform: "node",
  bundle: true,
  minify: false,
  sourcemap: false,
  format: "cjs",
  target: "node16",
  entryPoints: ["./src/index.ts"],
  outdir: "./dist",
  watch: shouldWatch
    ? {
        onRebuild(error, result) {
          if (error)
            console.error(
              new Date().toLocaleTimeString() + " > watch build failed!!!!!!!!!!!!!!"
            );
          else console.log(new Date().toLocaleTimeString() + " > watch build succeeded");
        },
      }
    : false,
  external,
})
  .then(() => {
    if (shouldWatch)
      console.log(
        "\nListening for file changes in src directory...\n\n            [Use ^C to exit...]\n"
      );
  })
  .catch(() => process.exit(1));
