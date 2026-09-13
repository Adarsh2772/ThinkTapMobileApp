package expo.modules.androidwakeword

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * JavaScript bridge to [AudioCaptureService].
 *
 * WHY the API changed shape: the old bridge exposed a wake-word service that
 * had to be paused before the JS side could record, because the two used
 * separate microphone sessions. That handshake was the source of every
 * mic-handoff bug - the pause could be late, or fail, or be undone by an OEM
 * restarting the service.
 *
 * There is no handshake now. One service owns the microphone and JS only tells
 * it what state to be in. expo-audio is no longer used for recording on
 * Android; the service writes the WAV itself from the same frames it feeds to
 * the command recogniser.
 */
class AndroidWakeWordModule : Module() {
  companion object {
    @Volatile private var instance: AndroidWakeWordModule? = null

    fun emit(event: String, payload: Map<String, Any?>) {
      try {
        instance?.sendEvent(event, payload)
      } catch (_: Exception) {
        // JS may not be attached yet - the state getters cover that case.
      }
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("React context lost")

  private var callWatcher: CallStateWatcher? = null

  private fun send(action: String, extras: (Intent) -> Unit = {}) {
    val intent = Intent(context, AudioCaptureService::class.java).apply {
      this.action = action
      extras(this)
    }
    /**
     * WHY the split: a microphone foreground service may only be STARTED while
     * the app is in the foreground on Android 12+. Sending further actions to
     * an already-running service does not have that restriction.
     */
    if (action == AudioCaptureService.ACTION_START_LISTENING ||
      action == AudioCaptureService.ACTION_START_RECORDING
    ) {
      ContextCompat.startForegroundService(context, intent)
    } else {
      context.startService(intent)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("AndroidWakeWord")

    Events(
      "onWakeDetected",
      "onRecordingState",
      "onPartialResult",
      "onError",
      "onListeningChange",
      "onCallState",
    )

    OnCreate {
      instance = this@AndroidWakeWordModule
      appContext.reactContext?.let { ctx ->
        // Warm the model so the first take is not delayed by a 40 MB unpack.
        VoskModelProvider.loadAsync(ctx) { _, _ -> }
      }
    }

    OnDestroy {
      if (instance === this@AndroidWakeWordModule) instance = null
      try { callWatcher?.stop() } catch (_: Exception) {}
      callWatcher = null
    }

    // ---------------- state ----------------

    Function("isSupported") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.O }

    Function("isModelReady") { VoskModelProvider.isReady() }

    Function("isListening") { AudioCaptureService.isRunning }

    Function("isRecording") { AudioCaptureService.isRecording }

    Function("isPaused") { AudioCaptureService.isPausedRecording }

    Function("currentPath") { AudioCaptureService.currentPath }

    Function("recordedMs") { AudioCaptureService.recordedMs.toDouble() }

    Function("hasMicPermission") {
      ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
        PackageManager.PERMISSION_GRANTED
    }

    // ---------------- listening ----------------

    AsyncFunction("startListening") {
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED
      ) {
        throw Exception("RECORD_AUDIO permission is required")
      }
      send(AudioCaptureService.ACTION_START_LISTENING)
      true
    }

    AsyncFunction("stopListening") {
      send(AudioCaptureService.ACTION_STOP_LISTENING)
      true
    }

    // ---------------- recording ----------------

    /**
     * Starts a take. Pass an absolute .wav path, or null to let the service
     * choose one under the app's external files directory.
     */
    AsyncFunction("startRecording") { outputPath: String? ->
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
        != PackageManager.PERMISSION_GRANTED
      ) {
        throw Exception("RECORD_AUDIO permission is required")
      }
      send(AudioCaptureService.ACTION_START_RECORDING) { intent ->
        if (outputPath != null) {
          intent.putExtra(AudioCaptureService.EXTRA_OUTPUT_PATH, outputPath)
        }
      }
      true
    }

    AsyncFunction("pauseRecording") {
      send(AudioCaptureService.ACTION_PAUSE_RECORDING); true
    }

    AsyncFunction("resumeRecording") {
      send(AudioCaptureService.ACTION_RESUME_RECORDING); true
    }

    AsyncFunction("stopRecording") {
      send(AudioCaptureService.ACTION_STOP_RECORDING); true
    }

    AsyncFunction("discardRecording") {
      send(AudioCaptureService.ACTION_DISCARD_RECORDING); true
    }

    /**
     * Suspend or resume command matching without releasing the microphone.
     *
     * WHY: playing a recording through the speaker feeds the app's own audio
     * back into its own microphone, so a take containing "hey think tap stop"
     * could stop a live recording. Call this with false before playback and
     * true after.
     */
    AsyncFunction("setCommandsEnabled") { enabled: Boolean ->
      send(AudioCaptureService.ACTION_SET_COMMANDS) { intent ->
        intent.putExtra(AudioCaptureService.EXTRA_COMMANDS_ENABLED, enabled)
      }
      true
    }

    Function("areCommandsEnabled") { AudioCaptureService.commandsEnabled }

    /**
     * Release the microphone while keeping any open take intact.
     *
     * WHY separate from stopListening: stopping the service would close the WAV
     * file and end the recording. This only releases AudioRecord, so the take
     * is paused and can continue into the same file when the app returns.
     */
    AsyncFunction("suspendMic") {
      send(AudioCaptureService.ACTION_SUSPEND_MIC); true
    }

    AsyncFunction("resumeMic") {
      send(AudioCaptureService.ACTION_RESUME_MIC); true
    }

    // ---------------- call watch ----------------

    Function("isCallActive") { callWatcher?.isCallActive() == true }

    AsyncFunction("startCallWatch") {
      val watcher = callWatcher ?: CallStateWatcher(context).also { callWatcher = it }
      watcher.start()
      watcher.isCallActive()
    }

    AsyncFunction("stopCallWatch") {
      callWatcher?.stop(); true
    }

    // ---------------- cues ----------------

    AsyncFunction("playRecordingStartCue") {
      RecognitionAudioGuard.playStartCue(context); true
    }

    AsyncFunction("playRecordingStopCue") {
      RecognitionAudioGuard.playStopCue(context); true
    }

    Function("restoreRecognitionUi") { RecognitionAudioGuard.restore(context) }
  }
}
