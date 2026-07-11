// Metro config for the pnpm monorepo. expo/metro-config auto-detects the
// workspace root; we widen watchFolders so Metro follows pnpm's symlinked
// node_modules at the repo root.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../..")];

module.exports = config;
