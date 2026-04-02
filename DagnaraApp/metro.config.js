const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /.*msdtadmin.*/,
  /.*Overwolf.*/,
];

config.watcher = {
  ...config.watcher,
  additionalExts: config.watcher?.additionalExts ?? [],
  watchman: {
    deferStates: ['hg.update'],
  },
  healthCheck: {
    enabled: false,
  },
  ignore: [
    path.join(process.env.LOCALAPPDATA ?? '', 'Temp', 'msdtadmin'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Overwolf'),
  ],
};

module.exports = config;
