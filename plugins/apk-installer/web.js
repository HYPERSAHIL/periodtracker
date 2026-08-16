export class ApkInstallerWeb {
  async isInstallPermitted() { return { permitted: true }; }
  async openInstallPermissionSettings() { throw new Error('not_available'); }
  async download() { throw new Error('not_available'); }
  async install() { throw new Error('not_available'); }
}
