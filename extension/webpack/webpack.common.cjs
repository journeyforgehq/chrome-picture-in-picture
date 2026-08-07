const path = require("path");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { CleanWebpackPlugin } = require("clean-webpack-plugin");
const { assertContentChunkIsClean } = require("./separation-guard.cjs");

const r = (p) => path.resolve(__dirname, "..", p);

// Load per-app build config (public client values: backend URL, Stripe links,
// accent, welcome URL) from a committed .env. dotenv does NOT override an
// already-set process.env, so a CI/shell env still wins; the file fills gaps.
// APP_ENV (local|staging|prod) selects the committed per-target env file:
//   local => .env (optional), staging => .env.staging, prod|production => .env.production.
// dotenv does NOT override an already-set process.env, so a CI/shell env still wins; the
// file fills gaps. .env.local (gitignored) then layers per-developer overrides on top.
const APP_ENV = process.env.APP_ENV || "local";
const ENV_FILE =
  APP_ENV === "staging" ? ".env.staging" :
  (APP_ENV === "prod" || APP_ENV === "production") ? ".env.production" :
  ".env";
require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || r(ENV_FILE) });
require("dotenv").config({ path: r(".env.local") }); // optional local overrides (git-ignored)

module.exports = (devPro) => ({
  entry: {
    background: r("src/background/background.ts"),
    content: r("src/content/content.ts"),
    popup: r("src/popup/index.tsx"),
    options: r("src/options/index.tsx"),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          // tsconfig.json sets noEmit: true (this project is typechecked
          // separately via `tsc --noEmit`); override it here so ts-loader
          // actually emits JS for webpack to bundle.
          options: { compilerOptions: { noEmit: false, jsx: "react-jsx" } },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: { extensions: [".ts", ".tsx", ".js"] },
  output: { filename: "[name].js", path: r("dist"), clean: true },
  optimization: { splitChunks: false },
  plugins: [
    new CleanWebpackPlugin(),
    new webpack.DefinePlugin({
      "process.env.BACKEND_BASE_URL": JSON.stringify(process.env.BACKEND_BASE_URL || ""),
      "process.env.STRIPE_MONTHLY_URL": JSON.stringify(process.env.STRIPE_MONTHLY_URL || ""),
      "process.env.STRIPE_ANNUAL_URL": JSON.stringify(process.env.STRIPE_ANNUAL_URL || ""),
      "process.env.STRIPE_LIFETIME_URL": JSON.stringify(process.env.STRIPE_LIFETIME_URL || ""),
      "process.env.WELCOME_URL": JSON.stringify(process.env.WELCOME_URL || ""),
      "process.env.UNINSTALL_URL": JSON.stringify(process.env.UNINSTALL_URL || ""),
      "process.env.ACCENT": JSON.stringify(process.env.ACCENT || ""),
      "process.env.DEV_PRO": JSON.stringify(devPro ? "true" : "false"),
    }),
    new CopyPlugin({ patterns: [{ from: r("src/static"), to: "." }] }),
    new HtmlWebpackPlugin({
      template: r("src/popup/popup.html"),
      filename: "popup.html",
      chunks: ["popup"],
    }),
    new HtmlWebpackPlugin({
      template: r("src/options/options.html"),
      filename: "options.html",
      chunks: ["options"],
    }),
    {
      apply(compiler) {
        compiler.hooks.afterEmit.tap("SeparationGuard", (compilation) => {
          assertContentChunkIsClean(compilation);
        });
      },
    },
  ],
});
