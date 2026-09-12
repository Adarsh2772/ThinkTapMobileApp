package expo.modules.androidwakeword

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File
import kotlin.concurrent.thread

/**
 * ONE microphone owner for the whole app.
 *
 * ================= WHY THIS EXISTS =================
 *
 * The previous build opened two microphone sessions:
 *
 *     SpeechRecognizer  -> mic session #1   (wake word)
 *     expo-audio        -> mic session #2   (recording)
 *
 * Android grants one session; the second fails. Every bug traced back to that:
 * the recording had no audio file, spoken "stop" was never heard while
 * recording, playback was dead, and the failure mode differed on every device
 * and OS version because each OEM arbitrates the microphone differently.
 *
 * Workarounds piled up - pausing the wake service during a take, asking the
 * recogniser to persist its own audio, branching on Platform.Version - and each
 * one broke somewhere else.
 *
 * This service fixes the cause. It opens a single AudioRecord and fans the same
 * PCM frames to two consumers that never touch the microphone themselves:
 *
 *     AudioRecord (one owner)
 *           |
 *           +--> WavWriter   (the recording - always saved)
 *           |
 *           +--> Vosk        (start / pause / resume / stop)
 *
 * No contention is possible, because there is only ever one session. Nothing in
 * this file branches on Android version, so behaviour is identical from API 26
 * through 16 and beyond, on any OEM.
 *
 * Vosk is Apache 2.0 - free, offline, no account, no key, no usage limit, no
 * licensing risk. Commands resolve in well under a second with no network.
 *
 * Vosk handles COMMANDS only. The user's transcript still comes from Whisper on
 * the saved WAV, because Vosk's small offline model is not accurate enough to
 * be the Human Signal.
 */
class AudioCaptureService : Service() {

  companion object {
    const val TAG = "ThinkTapCapture"
    const val CHANNEL_ID = "thinktap_capture_v1"
    const val NOTIFICATION_ID = 7201

    const val ACTION_START_LISTENING = "expo.modules.androidwakeword.START_LISTENING"
    const val ACTION_STOP_LISTENING = "expo.modules.androidwakeword.STOP_LISTENING"
    const val ACTION_START_RECORDING = "expo.modules.androidwakeword.START_RECORDING"
    const val ACTION_PAUSE_RECORDING = "expo.modules.androidwakeword.PAUSE_RECORDING"
    const val ACTION_RESUME_RECORDING = "expo.modules.androidwakeword.RESUME_RECORDING"
    const val ACTION_STOP_RECORDING = "expo.modules.androidwakeword.STOP_RECORDING"
    const val ACTION_DISCARD_RECORDING = "expo.modules.androidwakeword.DISCARD_RECORDING"

    const val EXTRA_OUTPUT_PATH = "outputPath"

    /** Vosk models are trained at 16 kHz. This is also ideal for speech WAV. */
    const val SAMPLE_RATE = 16000

    /**
     * Grammar-constrained recognition, with a DIFFERENT grammar per state.
     *
     * WHY constrained at all: an open Vosk recogniser decodes against its full
     * ~200k vocabulary and never returns a brand name. Captured output was
     * "hitting tabs", "hey thing that", "so i think that" - the phrase had to
     * be said six or seven times before anything matched.
     *
     * WHY two grammars: with one shared grammar, every sentence spoken DURING a
     * take was also scored against the command list. Ordinary dictation was
     * forced onto the nearest entry and ended the recording - a real take
     * stopped on "end recording" that the user never said.
     *
     * Idle: bare wake phrases are fine, nothing is being recorded.
     * Recording: commands MUST include the name. No bare "stop" or "pause",
     * because those are ordinary words that appear in normal speech.
     */
    private const val GRAMMAR_IDLE = """[
      "hey think tap",
      "hey think tap start",
      "think tap",
      "think tap start",
      "start recording",
      "begin recording",
      "[unk]"
    ]"""

    private const val GRAMMAR_RECORDING = """[
      "hey think tap stop",
      "hey think tap pause",
      "hey think tap resume",
      "think tap stop",
      "think tap pause",
      "think tap resume",
      "[unk]"
    ]"""

    @Volatile var isRunning: Boolean = false; private set
    @Volatile var isRecording: Boolean = false; private set
    @Volatile var isPausedRecording: Boolean = false; private set
    @Volatile var commandsEnabled: Boolean = true; private set
    @Volatile var currentPath: String? = null; private set
    /** Live audio written, in ms. Updated from the capture loop. */
    @Volatile var recordedMs: Long = 0
  }

  private var audioRecord: AudioRecord? = null
  private var captureThread: Thread? = null
  @Volatile private var capturing = false

  private var wavWriter: WavWriter? = null
  private var recognizer: Recognizer? = null
  private var model: Model? = null
  /** Which grammar the live recogniser was built with. */
  private var recognizerGrammar: String? = null

  private var lastCommandAt = 0L
  private val commandDebounceMs = 1500L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
    VoskModelProvider.loadAsync(this) { loaded, error ->
      if (loaded != null) {
        model = loaded
        Log.i(TAG, "Vosk model ready")
      } else {
        Log.w(TAG, "Vosk model unavailable: $error")
        // WHY not fatal: recording must still work. Only voice commands are
        // lost, and the UI buttons cover those.
        AndroidWakeWordModule.emit(
          "onError",
          mapOf("code" to "model-unavailable", "message" to (error ?: "model load failed")),
        )
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    /**
     * WHY the null check: START_STICKY means the OS restarts this service with
     * a null intent after an OEM process kill (OPPO, Xiaomi and Vivo do this
     * aggressively). The old service treated that like an explicit start and
     * grabbed the microphone back mid-recording, which is what made takes stop
     * and restart by themselves. Come back idle and wait for an explicit
     * instruction.
     */
    if (intent == null) {
      Log.w(TAG, "restarted by system - staying idle")
      stopSelf()
      return START_NOT_STICKY
    }

    when (intent.action) {
      ACTION_START_LISTENING -> startListening()
      ACTION_STOP_LISTENING -> stopEverything()
      ACTION_START_RECORDING -> startRecording(intent.getStringExtra(EXTRA_OUTPUT_PATH))
      ACTION_PAUSE_RECORDING -> pauseRecording(fromVoice = false)
      ACTION_RESUME_RECORDING -> resumeRecording(fromVoice = false)
      ACTION_STOP_RECORDING -> stopRecording(fromVoice = false)
      ACTION_DISCARD_RECORDING -> discardRecording()
      else -> Log.w(TAG, "unknown action ${intent.action}")
    }
    return START_STICKY
  }

  override fun onDestroy() {
    stopEverything()
    super.onDestroy()
  }

  // ------------------------------------------------------------------
  // Capture loop - the single microphone owner
  // ------------------------------------------------------------------

  private fun startListening() {
    if (capturing) {
      updateNotification()
      return
    }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
      != PackageManager.PERMISSION_GRANTED
    ) {
      AndroidWakeWordModule.emit(
        "onError",
        mapOf("code" to "permission", "message" to "Microphone permission required"),
      )
      return
    }

    ensureForeground()

    val minBuf = AudioRecord.getMinBufferSize(
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT,
    )
    if (minBuf <= 0) {
      AndroidWakeWordModule.emit(
        "onError",
        mapOf("code" to "unavailable", "message" to "AudioRecord unavailable"),
      )
      return
    }
    // Generous buffer: an undersized one drops frames on slower devices and
    // shows up as gaps in the WAV.
    val bufSize = minBuf * 4

    val rec = try {
      AudioRecord(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufSize,
      )
    } catch (e: Exception) {
      Log.e(TAG, "AudioRecord create failed", e)
      AndroidWakeWordModule.emit(
        "onError",
        mapOf("code" to "start-failed", "message" to (e.message ?: "AudioRecord failed")),
      )
      return
    }

    if (rec.state != AudioRecord.STATE_INITIALIZED) {
      Log.e(TAG, "AudioRecord not initialised")
      rec.release()
      AndroidWakeWordModule.emit(
        "onError",
        mapOf("code" to "start-failed", "message" to "AudioRecord not initialised"),
      )
      return
    }

    audioRecord = rec
    capturing = true
    isRunning = true
    rec.startRecording()

    captureThread = thread(name = "ThinkTapCapture", isDaemon = true) {
      // 200 ms frames: small enough for responsive commands, large enough to
      // keep JNI overhead low.
      val frame = ShortArray(SAMPLE_RATE / 5)
      while (capturing) {
        val read = try {
          rec.read(frame, 0, frame.size)
        } catch (e: Exception) {
          Log.e(TAG, "read failed", e); -1
        }
        if (read <= 0) continue

        // Consumer 1 - the recording.
        val writer = wavWriter
        if (writer != null) {
          writer.write(frame, read)
          /**
           * WHY here: recordedMs used to be set only on pause and stop, so the
           * on-screen timer read 0 for the whole take. Publishing it from the
           * capture loop means the UI sees real elapsed audio, and because it
           * comes from bytes actually written it never counts paused time.
           */
          recordedMs = writer.durationMs
        }

        // Consumer 2 - command recognition.
        if (commandsEnabled) feedRecognizer(frame, read)
      }
    }

    emitListening()
    updateNotification()
    Log.i(TAG, "capture started - single AudioRecord owner")
  }

  private fun feedRecognizer(frame: ShortArray, read: Int) {
    // Recording and idle use different phrase sets - see GRAMMAR_IDLE.
    val wanted = if (isRecording) GRAMMAR_RECORDING else GRAMMAR_IDLE
    if (recognizer != null && recognizerGrammar != wanted) {
      try { recognizer?.close() } catch (_: Exception) {}
      recognizer = null
    }

    val r = recognizer ?: run {
      val m = model ?: return
      val fresh = try {
        Recognizer(m, SAMPLE_RATE.toFloat(), wanted)
      } catch (e: Exception) {
        Log.e(TAG, "Recognizer create failed", e); return
      }
      recognizer = fresh
      recognizerGrammar = wanted
      Log.i(TAG, "recogniser grammar -> ${if (isRecording) "RECORDING" else "IDLE"}")
      fresh
    }

    val bytes = ByteArray(read * 2)
    var j = 0
    for (i in 0 until read) {
      val s = frame[i].toInt()
      bytes[j++] = (s and 0xFF).toByte()
      bytes[j++] = ((s shr 8) and 0xFF).toByte()
    }

    try {
      if (r.acceptWaveForm(bytes, bytes.size)) {
        handleText(JSONObject(r.result).optString("text", ""), final = true)
      } else {
        handleText(JSONObject(r.partialResult).optString("partial", ""), final = false)
      }
    } catch (e: Exception) {
      Log.w(TAG, "recognizer error", e)
    }
  }

  private fun handleText(text: String, final: Boolean) {
    if (text.isBlank()) return

    AndroidWakeWordModule.emit(
      "onPartialResult",
      mapOf("transcript" to text, "isFinal" to final),
    )

    val now = System.currentTimeMillis()
    if (now - lastCommandAt < commandDebounceMs) return

    val cmd = CommandMatcher.match(text, isRecording, isPausedRecording)
    if (cmd == CommandMatcher.Command.NONE) return
    lastCommandAt = now

    Log.i(TAG, "command=$cmd from \"$text\"")
    when (cmd) {
      CommandMatcher.Command.WAKE ->
        AndroidWakeWordModule.emit("onWakeDetected", mapOf("transcript" to text))
      CommandMatcher.Command.STOP -> stopRecording(fromVoice = true, transcript = text)
      CommandMatcher.Command.PAUSE -> pauseRecording(fromVoice = true, transcript = text)
      CommandMatcher.Command.RESUME -> resumeRecording(fromVoice = true, transcript = text)
      CommandMatcher.Command.NONE -> {}
    }
    // Reset so a command is not re-detected from lingering partial text.
    try { recognizer?.reset() } catch (_: Exception) {}
  }

  // ------------------------------------------------------------------
  // Recording state - never touches the microphone
  // ------------------------------------------------------------------

  private fun startRecording(outputPath: String?) {
    if (isRecording) return
    if (!capturing) startListening()

    val path = outputPath ?: File(
      getExternalFilesDir(null) ?: filesDir,
      "recordings/idea-${System.currentTimeMillis()}.wav",
    ).absolutePath

    val writer = WavWriter(File(path), SAMPLE_RATE)
    try {
      writer.open()
    } catch (e: Exception) {
      Log.e(TAG, "could not open $path", e)
      AndroidWakeWordModule.emit(
        "onError",
        mapOf("code" to "file-failed", "message" to (e.message ?: "could not open file")),
      )
      return
    }

    wavWriter = writer
    isRecording = true
    isPausedRecording = false
    currentPath = path
    recordedMs = 0

    RecognitionAudioGuard.playStartCue(this)
    emitRecording("started", path)
    updateNotification()
    Log.i(TAG, "recording -> $path")
  }

  private fun pauseRecording(fromVoice: Boolean, transcript: String = "") {
    if (!isRecording || isPausedRecording) return
    /**
     * WHY the capture loop keeps running while paused: if it stopped, the
     * microphone would be released and "resume" could never be heard. Only the
     * file writer pauses.
     */
    wavWriter?.pause()
    isPausedRecording = true
    recordedMs = wavWriter?.durationMs ?: 0
    emitRecording("paused", currentPath, fromVoice, transcript)
    updateNotification()
  }

  private fun resumeRecording(fromVoice: Boolean, transcript: String = "") {
    if (!isRecording || !isPausedRecording) return
    wavWriter?.resume()
    isPausedRecording = false
    emitRecording("resumed", currentPath, fromVoice, transcript)
    updateNotification()
  }

  private fun stopRecording(fromVoice: Boolean, transcript: String = "") {
    if (!isRecording) return
    val writer = wavWriter
    recordedMs = writer?.durationMs ?: 0
    val saved = writer?.close()
    wavWriter = null
    isRecording = false
    isPausedRecording = false

    RecognitionAudioGuard.playStopCue(this)
    AndroidWakeWordModule.emit(
      "onRecordingState",
      mapOf(
        "state" to "stopped",
        "path" to (saved ?: ""),
        "durationMs" to recordedMs,
        "fromVoice" to fromVoice,
        "transcript" to transcript,
      ),
    )
    currentPath = null
    updateNotification()
    Log.i(TAG, "recording stopped saved=$saved ms=$recordedMs voice=$fromVoice")
  }

  private fun discardRecording() {
    wavWriter?.discard()
    wavWriter = null
    isRecording = false
    isPausedRecording = false
    currentPath = null
    recordedMs = 0
    emitRecording("discarded", null)
    updateNotification()
  }

  private fun stopEverything() {
    capturing = false
    try { captureThread?.join(500) } catch (_: Exception) {}
    captureThread = null

    if (isRecording) {
      wavWriter?.close()
      wavWriter = null
      isRecording = false
      isPausedRecording = false
    }

    try {
      audioRecord?.stop()
      audioRecord?.release()
    } catch (e: Exception) {
      Log.w(TAG, "release failed", e)
    }
    audioRecord = null

    try { recognizer?.close() } catch (_: Exception) {}
    recognizer = null

    isRunning = false
    emitListening()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
    Log.i(TAG, "capture stopped - microphone released")
  }

  // ------------------------------------------------------------------
  // Events and notification
  // ------------------------------------------------------------------

  private fun emitListening() {
    AndroidWakeWordModule.emit(
      "onListeningChange",
      mapOf("listening" to isRunning, "paused" to isPausedRecording),
    )
  }

  private fun emitRecording(
    state: String,
    path: String?,
    fromVoice: Boolean = false,
    transcript: String = "",
  ) {
    AndroidWakeWordModule.emit(
      "onRecordingState",
      mapOf(
        "state" to state,
        "path" to (path ?: ""),
        "durationMs" to (wavWriter?.durationMs ?: recordedMs),
        "fromVoice" to fromVoice,
        "transcript" to transcript,
      ),
    )
  }

  private fun ensureForeground() {
    val n = buildNotification()
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      @Suppress("DEPRECATION")
      startForeground(NOTIFICATION_ID, n)
    }
  }

  private fun statusText(): String = when {
    isRecording && isPausedRecording -> "Paused - say \"Hey ThinkTap resume\""
    isRecording -> "Recording - say \"Hey ThinkTap stop\" to finish"
    isRunning -> "Listening for \"Hey ThinkTap\""
    else -> "Idle"
  }

  private fun updateNotification() {
    if (!isRunning) return
    try {
      getSystemService(NotificationManager::class.java)
        ?.notify(NOTIFICATION_ID, buildNotification())
    } catch (e: Exception) {
      Log.w(TAG, "notify failed", e)
    }
  }

  private fun buildNotification(): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pending = PendingIntent.getActivity(
      this, 0, launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Think Tap")
      .setContentText(statusText())
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentIntent(pending)
      .setOngoing(true)
      .setSilent(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(NotificationManager::class.java) ?: return
    val ch = NotificationChannel(
      CHANNEL_ID,
      "Think Tap recording",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Shows while Think Tap is listening or recording"
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
    }
    mgr.createNotificationChannel(ch)
  }
}
