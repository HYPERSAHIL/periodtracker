package run.periodtracker.app

import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Temperature
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray

/**
 * Writes recent cycle data to Android Health Connect: MenstruationFlowRecord
 * (flow), BodyTemperatureRecord (BBT), WeightRecord. Called with day-granular
 * JSON from the web app each time stats change.
 *
 * Idempotency: every record carries a clientRecordId built from the source
 * date ("pt:menstruation:2026-01-02"), so re-pushing the same day updates the
 * existing record instead of piling duplicates.
 *
 * Permissions: runtime grant in the Health Connect UI. push() resolves
 * {ok:false, needsPermissions:true, missing:[..]} until granted;
 * openPermissionScreen() sends the user to Health Connect's grant screen.
 * Nothing here throws — every failure resolves with a reason string.
 *
 * API facts verified against connect-client 1.1.0 (javap on the AAR):
 * flow/temperature/weight records are single-time samples (time + zoneOffset),
 * MenstruationRecord was split into Flow/Period records, and 1.1.0 dropped
 * FLOW_SPOTTING (mapped to UNKNOWN below).
 */
@CapacitorPlugin(name = "HealthBridge")
class HealthBridgePlugin : Plugin() {

  private val scope = CoroutineScope(Dispatchers.IO)

  private fun writePerms(): Set<String> = setOf(
    HealthPermission.getWritePermission(MenstruationFlowRecord::class),
    HealthPermission.getWritePermission(BodyTemperatureRecord::class),
    HealthPermission.getWritePermission(WeightRecord::class),
  )

  @PluginMethod
  fun sdkAvailable(call: PluginCall) {
    val ret = JSObject()
    ret.put("available", HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE)
    call.resolve(ret)
  }

  @PluginMethod
  fun push(call: PluginCall) {
    if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
      val ret = JSObject(); ret.put("ok", false); ret.put("reason", "sdk_unavailable")
      call.resolve(ret)
      return
    }
    val client = HealthConnectClient.getOrCreate(context)
    val perms = writePerms()
    scope.launch {
      try {
        val missing = perms - client.permissionController.getGrantedPermissions()
        if (missing.isNotEmpty()) {
          val ret = JSObject()
          ret.put("ok", false)
          ret.put("needsPermissions", true)
          val arr = JSArray()
          for (p in missing) arr.put(p)
          ret.put("missing", arr)
          call.resolve(ret)
          return@launch
        }
        val records = mutableListOf<Record>()
        val zone = ZoneId.systemDefault()
        val days = JSONArray(call.getString("days", "[]") ?: "[]")
        for (i in 0 until days.length()) {
          val d = days.getJSONObject(i)
          val date = LocalDate.parse(d.getString("date"))
          val time = date.atStartOfDay(zone).toInstant()
          val offset = zone.rules.getOffset(time)
          val flow = d.optString("flow", "")
          if (flow.isNotEmpty()) {
            records.add(
              MenstruationFlowRecord(
                time = time,
                zoneOffset = offset,
                metadata = Metadata.manualEntryWithId("pt:menstruation:" + d.getString("date")),
                flow = when (flow) {
                  "light" -> MenstruationFlowRecord.FLOW_LIGHT
                  "medium" -> MenstruationFlowRecord.FLOW_MEDIUM
                  "heavy" -> MenstruationFlowRecord.FLOW_HEAVY
                  // 1.1.0 has no SPOTTING value; keep unknown rather than mislabel
                  else -> MenstruationFlowRecord.FLOW_UNKNOWN
                },
              )
            )
          }
          if (!d.isNull("bbt")) {
            records.add(
              BodyTemperatureRecord(
                time = time,
                zoneOffset = offset,
                metadata = Metadata.manualEntryWithId("pt:temperature:" + d.getString("date")),
                temperature = Temperature.celsius(d.getDouble("bbt")),
              )
            )
          }
          if (!d.isNull("weight")) {
            records.add(
              WeightRecord(
                time = time,
                zoneOffset = offset,
                metadata = Metadata.manualEntryWithId("pt:weight:" + d.getString("date")),
                weight = Mass.kilograms(d.getDouble("weight")),
              )
            )
          }
        }
        if (records.isEmpty()) {
          val ret = JSObject(); ret.put("ok", true); ret.put("count", 0)
          call.resolve(ret)
          return@launch
        }
        client.insertRecords(records)
        val ret = JSObject(); ret.put("ok", true); ret.put("count", records.size)
        call.resolve(ret)
      } catch (t: Throwable) {
        val ret = JSObject(); ret.put("ok", false); ret.put("reason", t.message ?: t.javaClass.simpleName)
        call.resolve(ret)
      }
    }
  }

  /** Sends the user to Health Connect's permission screen for this app. */
  @PluginMethod
  fun openPermissionScreen(call: PluginCall) {
    try {
      val intent = Intent("android.health.connect.action.REQUEST_HEALTH_PERMISSIONS")
      intent.putExtra(Intent.EXTRA_PACKAGE_NAME, context.packageName)
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
      call.resolve()
    } catch (t: Throwable) {
      val ret = JSObject(); ret.put("ok", false); ret.put("reason", "no_permission_activity")
      call.resolve(ret)
    }
  }
}
