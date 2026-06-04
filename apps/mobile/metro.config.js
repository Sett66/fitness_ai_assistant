const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

/** @type {import('@react-native/metro-config').MetroConfig} */
const config = {
  // packages：workspace 包；node_modules：pnpm isolated 软链（ADR 0006）
  watchFolders: [
    path.resolve(monorepoRoot, 'packages'),
    path.resolve(monorepoRoot, 'node_modules'),
  ],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    disableHierarchicalLookup: false,
    unstable_enableSymlinks: true,
    blockList: [
      /.*[\\/]android[\\/]app[\\/]build[\\/].*/,
      /.*[\\/]android[\\/]build[\\/].*/,
      /.*[\\/]android[\\/]\.gradle[\\/].*/,
      /.*[\\/]ios[\\/]build[\\/].*/,
      /.*[\\/]\.cxx[\\/].*/,
    ],
  },
  watcher: {
    healthCheck: {
      enabled: true,
    },
  },
};

module.exports = withNativeWind(mergeConfig(getDefaultConfig(projectRoot), config), {
  input: './global.css',
});
