import type { GatsbyConfig } from "gatsby";

const config: GatsbyConfig = {
  siteMetadata: { title: "Welcome", siteUrl: "https://example.com" },
  // Gatsby 5 needs no plugins for a single themed page; add a favicon/manifest plugin per app (slot).
  plugins: [],
};

export default config;
