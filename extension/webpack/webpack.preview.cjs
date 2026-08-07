// Dev-only build for the ui-kit preview gallery. Deliberately NOT merged into
// webpack.common.cjs (which defines only background/content) — this keeps
// antd/react out of the background+content build graph so the separation
// guard continues to check a build that never touches ui-kit/antd.
const path = require("path");
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
    new HtmlWebpackPlugin({
      template: r("preview/gallery.html"),
      filename: "index.html",
      chunks: ["gallery"],
    }),
  ],
};
