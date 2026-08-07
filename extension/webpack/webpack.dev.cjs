const { merge } = require("webpack-merge");
const common = require("./webpack.common.cjs");

// Dev allows DEV_PRO to be toggled via shell env for local iteration
// without a live worker (spec §9). Never true unless explicitly exported.
const devPro = process.env.DEV_PRO === "true";

module.exports = merge(common(devPro), {
  mode: "development",
  devtool: "inline-source-map",
});
