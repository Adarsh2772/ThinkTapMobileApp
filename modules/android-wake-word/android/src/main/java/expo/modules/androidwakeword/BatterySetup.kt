package expo.modules.androidwakeword

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * Battery and autostart setup.
 *
 * WHY this exists: a microphone foreground service is killed by default on most
 * Android phones, and hardest on OPPO, Xiaomi, Vivo and Realme. The fix is a
 * device setting the user has to change - and almost nobody does. They just
 * conclude the app is broken and stop using it, without reporting anything.
 *
 * Two of the three steps can be handled for the user:
 *
 *   1. Battery optimisation exemption - a standard system dialog, one tap
 *   2. OEM autostart - no API exists, but the settings page can be opened
 *      directly so the user is one toggle away instead of hunting menus
 *
 * Nothing here changes a setting silently. Android does not allow that, and it
 * would be wrong if it did - the user always sees and confirms.
 */
object BatterySetup {
  private const val TAG = "ThinkTapBattery"

  /** True when the OS will not doze this app. */
  fun isIgnoringBatteryOptimizations(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    return try {
      val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
      pm.isIgnoringBatteryOptimizations(context.packageName)
    } catch (e: Exception) {
      Log.w(TAG, "isIgnoringBatteryOptimizations failed", e)
      false
    }
  }

  /**
   * Shows the system "Allow app to always run in the background?" dialog.
   * One tap for the user. Returns false if the dialog could not be shown.
   */
  fun requestIgnoreBatteryOptimizations(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    if (isIgnoringBatteryOptimizations(context)) return true
    return try {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      true
    } catch (e: Exception) {
      Log.w(TAG, "request dialog failed, falling back to settings list", e)
      openBatterySettings(context)
    }
  }

  /** The full battery-optimisation list, as a fallback. */
  fun openBatterySettings(context: Context): Boolean {
    return try {
      val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      true
    } catch (e: Exception) {
      Log.w(TAG, "battery settings failed", e)
      openAppDetails(context)
    }
  }

  /**
   * Manufacturers that kill background services regardless of the standard
   * battery setting. Each needs its own autostart screen.
   */
  fun isAggressiveOem(): Boolean {
    val m = Build.MANUFACTURER.lowercase()
    return m.contains("oppo") || m.contains("vivo") || m.contains("xiaomi") ||
      m.contains("redmi") || m.contains("poco") || m.contains("realme") ||
      m.contains("oneplus") || m.contains("huawei") || m.contains("honor") ||
      m.contains("meizu") || m.contains("asus") || m.contains("letv")
  }

  fun oemName(): String = Build.MANUFACTURER

  /**
   * Opens the manufacturer's autostart screen.
   *
   * WHY hardcoded component names: there is no public API for this. Each OEM
   * buries it in its own settings app under a different activity. These are the
   * documented entry points; if one is missing on a given firmware the app
   * falls back to its own details page, which is always reachable.
   */
  fun openAutostartSettings(context: Context): Boolean {
    val candidates = listOf(
      // OPPO / Realme
      ComponentName(
        "com.coloros.safecenter",
        "com.coloros.safecenter.permission.startup.StartupAppListActivity",
      ),
      ComponentName(
        "com.coloros.safecenter",
        "com.coloros.safecenter.startupapp.StartupAppListActivity",
      ),
      ComponentName(
        "com.oppo.safe",
        "com.oppo.safe.permission.startup.StartupAppListActivity",
      ),
      // Vivo
      ComponentName(
        "com.vivo.permissionmanager",
        "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
      ),
      ComponentName(
        "com.iqoo.secure",
        "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager",
      ),
      // Xiaomi / Redmi / Poco
      ComponentName(
        "com.miui.securitycenter",
        "com.miui.permcenter.autostart.AutoStartManagementActivity",
      ),
      // Huawei / Honor
      ComponentName(
        "com.huawei.systemmanager",
        "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
      ),
      ComponentName(
        "com.huawei.systemmanager",
        "com.huawei.systemmanager.optimize.process.ProtectActivity",
      ),
      // Letv / Meizu / Asus
      ComponentName(
        "com.letv.android.letvsafe",
        "com.letv.android.letvsafe.AutobootManageActivity",
      ),
      ComponentName(
        "com.meizu.safe",
        "com.meizu.safe.security.SHOW_APPSEC",
      ),
      ComponentName(
        "com.asus.mobilemanager",
        "com.asus.mobilemanager.entry.FunctionActivity",
      ),
    )

    for (component in candidates) {
      try {
        val intent = Intent().apply {
          this.component = component
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        if (context.packageManager.resolveActivity(intent, 0) != null) {
          context.startActivity(intent)
          return true
        }
      } catch (_: Exception) {
        // Try the next candidate.
      }
    }

    Log.w(TAG, "no autostart screen found for ${Build.MANUFACTURER}")
    return openAppDetails(context)
  }

  /** Always available - the app's own settings page. */
  fun openAppDetails(context: Context): Boolean {
    return try {
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
      true
    } catch (e: Exception) {
      Log.e(TAG, "app details failed", e)
      false
    }
  }
}
