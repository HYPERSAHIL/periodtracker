package run.periodtracker.apkinstaller;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Downloads an update APK into the app cache and launches the system installer.
 * Handles the "install unknown apps" permission flow: JS can query real state
 * via isInstallPermitted() and send the user to the OS settings when needed.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    private File apkFile() {
        return new File(getContext().getCacheDir(), "update.apk");
    }

    @PluginMethod
    public void isInstallPermitted(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ret.put("permitted", getContext().getPackageManager().canRequestPackageInstalls());
        } else {
            ret.put("permitted", true); // pre-Android-8 prompts at install time instead
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void download(PluginCall call) {
        final String urlStr = call.getString("url");
        if (urlStr == null) {
            call.reject("url_required");
            return;
        }
        new Thread(() -> {
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.connect();
                long total = conn.getContentLength();
                InputStream in = conn.getInputStream();
                File out = new File(getContext().getCacheDir(), "update.apk.part");
                FileOutputStream fos = new FileOutputStream(out);
                byte[] buf = new byte[16384];
                long done = 0;
                int n;
                long lastNotify = 0;
                while ((n = in.read(buf)) > 0) {
                    fos.write(buf, 0, n);
                    done += n;
                    if (total > 0 && done - lastNotify > 262144) { // throttle ~every 256KB
                        lastNotify = done;
                        JSObject p = new JSObject();
                        p.put("progress", (int) (done * 100 / total));
                        notifyListeners("downloadProgress", p);
                    }
                }
                fos.close();
                in.close();
                conn.disconnect();
                if (apkFile().exists()) apkFile().delete();
                if (!out.renameTo(apkFile())) {
                    call.reject("rename_failed");
                    return;
                }
                JSObject ret = new JSObject();
                ret.put("path", apkFile().getAbsolutePath());
                ret.put("size", apkFile().length());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("download_failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void install(PluginCall call) {
        try {
            File apk = apkFile();
            if (!apk.exists()) {
                call.reject("no_downloaded_apk");
                return;
            }
            Uri uri = FileProvider.getUriForFile(
                getContext(), getContext().getPackageName() + ".apkinstaller.provider", apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("install_failed: " + e.getMessage());
        }
    }
}
