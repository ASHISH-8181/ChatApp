const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch monorepo workspace root
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// 3. Ensure sourceExts includes mjs and cjs
config.resolver.sourceExts = [
  ...new Set([...config.resolver.sourceExts, "mjs", "cjs", "json"]),
];

// 4. Enable package exports resolution
config.resolver.unstable_enablePackageExports = true;

// 5. Explicit alias for @clerk/expo to guarantee direct resolution
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@clerk/expo": path.resolve(workspaceRoot, "node_modules/@clerk/expo"),
};

module.exports = config;
