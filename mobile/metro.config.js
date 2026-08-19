// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Ensure .db files are bundled as assets so expo-sqlite's assetSource can
// copy the dictionary database into the app at runtime.
config.resolver.assetExts.push("db");

module.exports = config;
