const { merge } = require("webpack-merge");
const common = require("./webpack.common.cjs");

// Prod hard-pins DEV_PRO to false regardless of the shell environment —
// this can never ship enabled (spec §9).
module.exports = merge(common(false), {
  mode: "production",
  bail: true,
});
