package run.periodtracker.apkinstaller;

import androidx.core.content.FileProvider;

/**
 * Distinct provider class so this plugin's manifest entry never collides with
 * the app's own androidx FileProvider during manifest merging (the merger keys
 * providers by android:name, and both used the bare androidx class).
 */
public class ApkInstallerFileProvider extends FileProvider {
}
