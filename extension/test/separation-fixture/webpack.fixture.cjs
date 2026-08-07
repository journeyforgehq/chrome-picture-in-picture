// Minimal standalone webpack config reusing the SAME separation-guard module
// the real build uses, pointed at the poisoned fixture entry. Proves the
// guard fires on a real build, not just a unit test of the matcher.
const path = require("path");
const { assertContentChunkIsClean } = require("../../webpack/separation-guard.cjs");

const r = (p) => path.resolve(__dirname, p);

module.exports = {
  mode: "development",
  bail: true, // a compilation error (guard) rejects the run() promise the test awaits
  entry: {
    content: r("content-transitive.ts"),
  },
  module: {
    rules: [{ test: /\.tsx?$/, use: { loader: "ts-loader", options: { compilerOptions: { noEmit: false } } }, exclude: /node_modules/ }],
  },
  resolve: { extensions: [".ts", ".tsx", ".js"] },
  output: { filename: "[name].js", path: r("../../dist-fixture"), clean: true },
  plugins: [
    {
      apply(compiler) {
        compiler.hooks.afterEmit.tap("SeparationGuard", (compilation) => {
          assertContentChunkIsClean(compilation);
        });
      },
    },
  ],
};
