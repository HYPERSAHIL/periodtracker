import { registerPlugin } from '@capacitor/core';

const ApkInstaller = registerPlugin('ApkInstaller', {
  web: () => import('./web.js').then((m) => new m.ApkInstallerWeb()),
});

export default ApkInstaller;
