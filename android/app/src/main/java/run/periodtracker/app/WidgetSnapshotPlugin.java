package run.periodtracker.app;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge the web app pushes a JSON snapshot through after every stats change:
 *   WidgetSnapshot.save({ json: '{"cycleDay":12,"nextStart":"2026-09-10"}' })
 * Stored in SharedPreferences so CycleWidget can render without a WebView.
 */
@CapacitorPlugin(name = "WidgetSnapshot")
public class WidgetSnapshotPlugin extends Plugin {
  @PluginMethod
  public void save(PluginCall call) {
    String json = call.getString("json", "{}");
    getContext()
        .getSharedPreferences(CycleWidget.PREFS, Context.MODE_PRIVATE)
        .edit()
        .putString("snapshot", json)
        .apply();
    CycleWidget.pushUpdate(getContext());
    JSObject ret = new JSObject();
    ret.put("ok", true);
    call.resolve(ret);
  }
}
