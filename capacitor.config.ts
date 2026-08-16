import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native shell config (iOS + Android). The web build in dist/ is the app body:
 *   npm run build && npm run native:sync   (on a machine with Xcode / Android Studio)
 * The app id is reverse-DNS; changing it later changes the app's identity in
 * stores, so pick the final one before the first store submission.
 */
const config: CapacitorConfig = {
  appId: 'run.periodtracker.app',
  appName: 'Period Tracker',
  webDir: 'dist',
  backgroundColor: '#fff6f8',
  ios: {
    contentInset: 'always',
  },
  android: {
    backgroundColor: '#fff6f8',
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#e11d63',
      showSpinner: false,
    },
  },
};

export default config;
