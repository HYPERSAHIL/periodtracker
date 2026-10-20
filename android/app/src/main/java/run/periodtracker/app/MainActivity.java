package run.periodtracker.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Capacitor 6: register local plugins before the bridge loads the webview
    registerPlugin(WidgetSnapshotPlugin.class);
    registerPlugin(HealthBridgePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
