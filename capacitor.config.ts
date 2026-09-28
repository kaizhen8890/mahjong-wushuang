import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mahjongwushuang.table',
  appName: '麻将无双',
  webDir: 'dist/client',
  android: {
    allowMixedContent: true,
    backgroundColor: '#080d0c',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
