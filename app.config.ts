import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

const isDevClientBuild = process.env.APP_VARIANT === 'development';

export default ({ config }: ConfigContext): ExpoConfig => {
  const base = (appJson.expo ?? config) as ExpoConfig;
  const plugins = (base.plugins ?? []).filter((plugin) => {
    if (typeof plugin === 'string') return plugin !== 'expo-dev-client';
    if (Array.isArray(plugin)) return plugin[0] !== 'expo-dev-client';
    return true;
  });

  if (isDevClientBuild) {
    plugins.push('expo-dev-client');
  }

  return {
    ...base,
    plugins,
    android: {
      ...base.android,
      versionCode: 1,
    },
  };
};
