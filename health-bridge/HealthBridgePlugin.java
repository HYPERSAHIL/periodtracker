package run.periodtracker.app;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

/**
 * Writes recent cycle data to Android Health Connect (Menstruation /
 * BodyTemperature / Weight records). Called with day-granular JSON from the
 * web app; duplicates are tolerated (Health Connect dedupes by time+type).
 * Requires the Health Connect SDK + runtime permissions (see README).
 */
@CapacitorPlugin(name = "HealthBridge")
public class HealthBridgePlugin extends Plugin {
  @PluginMethod
  public void push(PluginCall call) {
    // NOTE: full implementation needs
    //   implementation "androidx.health.connect:connect-client:1.2.x"
    // plus PermissionController.createRequestPermissionResultContract() flow.
    // Staged shape — see README for the wiring checklist:
    //
    //   JSONArray days = new JSONArray(call.getString("days", "[]"));
    //   HealthConnectClient client = HealthConnectClient.getOrCreate(getContext());
    //   List<Record> records = new ArrayList<>();
    //   for (int i = 0; i < days.length(); i++) {
    //     JSONObject d = days.getJSONObject(i);
    //     if (d.has("flow")) records.add(new MenstruationRecord(...));
    //     ...
    //   }
    //   client.insertRecords(records);
    JSObject ret = new JSObject();
    ret.put("ok", false);
    ret.put("staged", true);
    call.resolve(ret);
  }
}
