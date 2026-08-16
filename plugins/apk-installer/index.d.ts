export interface ApkInstallerPlugin {
  isInstallPermitted(): Promise<{ permitted: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  download(options: { url: string }): Promise<{ path: string; size: number }>;
  install(): Promise<void>;
  addListener(eventName: 'downloadProgress', listenerFunc: (state: { progress: number }) => void): Promise<any>;
}
declare const ApkInstaller: ApkInstallerPlugin;
export default ApkInstaller;
