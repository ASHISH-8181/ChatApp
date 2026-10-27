const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Monorepo root (two levels up from apps/mobile)
const monorepoRoot = path.resolve(__dirname, "../..");

const config = getDefaultConfig(__dirname);

// ─── Monorepo setup ────────────────────────────────────────────────────────────
// Watch the whole monorepo so Metro can find packages in the root node_modules.
config.watchFolders = [monorepoRoot];

// Tell Metro to look for modules in the root node_modules FIRST, then the local one.
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Ensure Metro resolves from the root for symlinked packages.
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
