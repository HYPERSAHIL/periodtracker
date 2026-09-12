package run.periodtracker.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.widget.RemoteViews;

/**
 * Home-screen widget: cycle day + next predicted period.
 * Reads the snapshot the web app pushes via WidgetSnapshotPlugin into the
 * "pt_widget" SharedPreferences (numbers/dates only, locale-formatted here,
 * so no translation table is needed on the native side).
 */
public class CycleWidget extends AppWidgetProvider {
  static final String PREFS = "pt_widget";

  static void pushUpdate(Context ctx) {
    AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
    ComponentName me = new ComponentName(ctx, CycleWidget.class);
    String json = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("snapshot", "{}");
    String line1 = "–";
    String line2 = "";
    try {
      org.json.JSONObject o = new org.json.JSONObject(json);
      if (!o.isNull("cycleDay")) line1 = "Day " + o.getInt("cycleDay");
      if (!o.isNull("nextStart")) line2 = o.getString("nextStart");
    } catch (Exception e) {
      line1 = "–";
    }
    for (int id : mgr.getAppWidgetIds(me)) {
      RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_cycle);
      v.setTextViewText(R.id.widget_line1, line1);
      v.setTextViewText(R.id.widget_line2, line2);
      mgr.updateAppWidget(id, v);
    }
  }

  @Override
  public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
    pushUpdate(ctx);
  }
}
