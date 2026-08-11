// Dev-only build for the ui-kit preview gallery. Deliberately NOT merged into
// webpack.common.cjs (which defines only background/content) — this keeps
// antd/react out of the background+content build graph so the separation
// guard continues to check a build that never touches ui-kit/antd.
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const r = (p) => path.resolve(__dirname, "..", p);

module.exports = {
  mode: "development",
  entry: { gallery: r("preview/gallery.tsx") },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: { compilerOptions: { noEmit: false, jsx: "react-jsx" } },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: { extensions: [".ts", ".tsx", ".js"] },
  output: { filename: "[name].js", path: r("dist-preview"), clean: true },
  devtool: "inline-source-map",
  plugins: [
    // The SAME copy the production build does (webpack.common.cjs), for the
    // same reason: OptionsView's disclosure panel loads
    // `pro-window-comparison.png` by a bare relative name, which resolves
    // against whichever HTML mounts it. Without this the gallery renders a
    // broken image and the visual spec screenshots a hole where the one asset
    // that page exists to show should be — the classic case of a UI check that
    // passes while the picture is wrong.
    new CopyPlugin({ patterns: [{ from: r("src/static"), to: "." }] }),
    new HtmlWebpackPlugin({
      template: r("preview/gallery.html"),
      filename: "index.html",
      chunks: ["gallery"],
    }),
  ],
};
