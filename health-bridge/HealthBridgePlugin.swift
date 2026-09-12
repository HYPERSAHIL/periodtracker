import Capacitor
import HealthKit

/// Writes recent cycle data to Apple HealthKit (menstruation flow, basal body
/// temperature, body weight). Staged shape — see README for the entitlements +
/// Info.plist checklist. Day-granular JSON in, HKQuantitySamples out.
@objc(HealthBridgePlugin)
public class HealthBridgePlugin: CAPPlugin, CAPBridgedPlugin {
  public let identifier = "HealthBridgePlugin"
  public let jsName = "HealthBridge"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "push", returnType: CAPPluginReturnPromise)
  ]

  private var store: HKHealthStore?

  @objc func push(_ call: CAPPluginCall) {
    guard HKHealthStore.isHealthDataAvailable() else {
      call.reject("healthkit-unavailable")
      return
    }
    // NOTE: request these read/write types first via
    //   store?.requestAuthorization(toShare: write, read: read) { ... }
    //   HKCategoryType.categoryType(forIdentifier: .menstrualFlow)!
    //   HKQuantityType.quantityType(forIdentifier: .basalBodyTemperature)!
    //   HKQuantityType.quantityType(forIdentifier: .bodyMass)!
    // Then map each day: flow spotting/light/medium/heavy ->
    //   HKCategoryValueMenstrualFlow(rawValue: 1...4), BBT in degC,
    //   weight in kg, and store.save(_:withCompletion:).
    call.resolve(["ok": false, "staged": true])
  }
}
