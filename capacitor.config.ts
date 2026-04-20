import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nathanbird.golfdrivetracker',
  appName: 'Golf Drive Tracker',
  webDir: 'dist',
  ios: {
    // Keep web view zoomable = false; matches a native-feeling app.
    contentInset: 'always',
  },
};

export default config;
