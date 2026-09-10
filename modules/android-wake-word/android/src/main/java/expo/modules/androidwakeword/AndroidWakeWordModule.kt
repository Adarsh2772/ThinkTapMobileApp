package expo.modules.androidwakeword

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AndroidWakeWordModule : Module() {
  companion object {
    @Volatile
    private var instance: AndroidWakeWordModule? = null

    fun emit(event: String, payload: Map<String, Any?>) {
      try {
        instance?.sendEvent(event, payload)
      } catch (_: Exception) {
        // JS may not be ready yet; pending SharedPreferences covers that path.
      }
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context lost")

  private var callWatcher: CallStateWatcher? = null

  override fun definition() = ModuleDefinition {
    Name("AndroidWakeWord")

    Events("onWakeDetected", "onStopDetected", "onPartialResult", "onError", "onListeningChange", "onCallState")

    OnCreate {
      instance = this@AndroidWakeWordModule
      try {
        val ctx = appContext.reactContext ?: appContext.currentActivity
        if (ctx != null) {
          RecognitionAudioGuard.restore(ctx)
        }
      } catch (_: Exception) {
        // React context may not be ready yet; service start also restores.
      }
    }

    OnDestroy {
      try {
        val ctx = appContext.reactContext ?: appContext.currentActivity
        if (ctx != null) {
          RecognitionAudioGuard.restore(ctx)
        }
      } catch (_: Exception) {
        // ignore
      }
      if (instance === this@AndroidWakeWordModule) {
        instance = null
      }
      try {
        callWatcher?.stop()
      } catch (_: Exception) {
        // ignore
      }
      callWatcher = null
    }

    Function("isSupported") {
      return@Function Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
    }

    Function("isRunning") {
      return@Function WakeWordForegroundService.isRunning
    }

    Function("isPaused") {
      return@Function WakeWordForegroundService.isPaused
    }

    Function("isCallActive") {
      return@Function callWatcher?.isCallActive() == true
    }

    AsyncFunction("startCallWatch") {
      val ctx = context
      val watcher = callWatcher ?: CallStateWatcher(ctx).also { callWatcher = it }
      watcher.start()
      return@AsyncFunction watcher.isCallActive()
    }

    AsyncFunction("stopCallWatch") {
      callWatcher?.stop()
      return@AsyncFunction true
    }

    AsyncFunction("startService") {
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED
      ) {
        throw Exception("RECORD_AUDIO permission is required")
      }

      val intent = Intent(context, WakeWordForegroundService::class.java).apply {
        action = WakeWordForegroundService.ACTION_START
      }
      ContextCompat.startForegroundService(context, intent)
      return@AsyncFunction true
    }

    AsyncFunction("stopService") {
      val intent = Intent(context, WakeWordForegroundService::class.java).apply {
        action = WakeWordForegroundService.ACTION_STOP
        putExtra(WakeWordForegroundService.EXTRA_KEEP_SILENT, false)
      }
      context.startService(intent)
      return@AsyncFunction true
    }

    AsyncFunction("stopServiceSilent") {
      val intent = Intent(context, WakeWordForegroundService::class.java).apply {
        action = WakeWordForegroundService.ACTION_STOP
        putExtra(WakeWordForegroundService.EXTRA_KEEP_SILENT, true)
      }
      context.startService(intent)
      return@AsyncFunction true
    }

    Function("silenceRecognitionUi") {
      RecognitionAudioGuard.swallowRecognizerCue(context)
    }

    Function("holdCaptureMute") {
      RecognitionAudioGuard.holdCaptureMute(context)
    }

    Function("releaseCaptureMute") {
      RecognitionAudioGuard.releaseCaptureMute(context)
    }

    Function("cancelRecognizerHaptic") {
      RecognitionAudioGuard.cancelRecognizerHaptic(context)
    }

    Function("restoreRecognitionUi") {
      RecognitionAudioGuard.restore(context)
    }

    AsyncFunction("playRecordingStartCue") {
      RecognitionAudioGuard.playStartCue(context)
      return@AsyncFunction true
    }

    AsyncFunction("playRecordingStopCue") {
      RecognitionAudioGuard.playStopCue(context)
      return@AsyncFunction true
    }

    AsyncFunction("pauseService") {
      if (!WakeWordForegroundService.isRunning) return@AsyncFunction false
      val intent = Intent(context, WakeWordForegroundService::class.java).apply {
        action = WakeWordForegroundService.ACTION_PAUSE
      }
      context.startService(intent)
      return@AsyncFunction true
    }

    AsyncFunction("resumeService") {
      if (!WakeWordForegroundService.isRunning) return@AsyncFunction false
      val intent = Intent(context, WakeWordForegroundService::class.java).apply {
        action = WakeWordForegroundService.ACTION_RESUME
      }
      context.startService(intent)
      return@AsyncFunction true
    }

    AsyncFunction("listenForStop") {
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED
      ) {
        return@AsyncFunction false
      }
      val intent = Intent(context, WakeWordForegroundService::class.java).apply {
        action = WakeWordForegroundService.ACTION_LISTEN_STOP
      }
      ContextCompat.startForegroundService(context, intent)
      return@AsyncFunction true
    }

    AsyncFunction("consumePendingWake") {
      val prefs = context.getSharedPreferences("thinktap_wake", Context.MODE_PRIVATE)
      val pending = prefs.getBoolean("pending", false)
      if (!pending) {
        return@AsyncFunction null
      }
      val transcript = prefs.getString("transcript", "") ?: ""
      val at = prefs.getLong("at", 0L)
      prefs.edit()
        .remove("pending")
        .remove("transcript")
        .remove("at")
        .apply()
      if (System.currentTimeMillis() - at > 30_000) {
        return@AsyncFunction null
      }
      return@AsyncFunction mapOf(
        "transcript" to transcript,
        "at" to at,
      )
    }

    AsyncFunction("consumePendingStop") {
      val prefs = context.getSharedPreferences("thinktap_wake", Context.MODE_PRIVATE)
      val pending = prefs.getBoolean("pendingStop", false)
      if (!pending) {
        return@AsyncFunction null
      }
      val transcript = prefs.getString("stopTranscript", "") ?: ""
      val at = prefs.getLong("stopAt", 0L)
      prefs.edit()
        .remove("pendingStop")
        .remove("stopTranscript")
        .remove("stopAt")
        .apply()
      if (System.currentTimeMillis() - at > 30_000) {
        return@AsyncFunction null
      }
      return@AsyncFunction mapOf(
        "transcript" to transcript,
        "at" to at,
      )
    }
  }
}
