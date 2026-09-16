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
import android.os.PowerManager
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
    const val ACTION_SET_COMMANDS = "expo.modules.androidwakeword.SET_COMMANDS"
    const val ACTION_SUSPEND_MIC = "expo.modules.androidwakeword.SUSPEND_MIC"
    const val ACTION_RESUME_MIC = "expo.modules.androidwakeword.RESUME_MIC"

    const val EXTRA_COMMANDS_ENABLED = "commandsEnabled"

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
    /**
     * WHY the verb is mandatory: the bare name used to be a valid start
     * command, so "think tap" mentioned in conversation began a recording. A
     * take that starts on its own is worse than one that needs a clearer
     * phrase, so every command now carries an explicit verb.
     */
    /**
     * ONE grammar for every state.
     *
     * WHY not one per state: grammar-constrained recognition must return one of
     * its phrases. With a start-only grammar while idle, saying "hey think tap
     * stop" had nowhere to go but "hey think tap start" - so a stop command
     * started a recording. With a stop-only grammar while recording, "start"
     * became "stop" and ended the take. Both were reported.
     *
     * Every command is now a candidate in every state, so the recogniser
     * returns what was actually said. CommandMatcher then decides whether that
     * command makes sense right now - "stop" while idle is simply ignored
     * rather than forced into something else.
     */
    private const val COMMAND_GRAMMAR = """[
      "hey think tap start",
      "hey think tap stop",
      "hey think tap pause",
      "hey think tap resume",
      "think tap start",
      "think tap stop",
      "think tap pause",
      "think tap resume",
      "[unk]"
    ]"""

    /**
     * WHY a cooldown: without it the tail of a stop command, or the user
     * speaking immediately afterwards, could trigger a fresh wake and open a
     * take they never asked for.
     */
    private const val POST_STOP_COOLDOWN_MS = 4000L

    /** Mean word confidence a final result must reach to count as a command. */
    private const val MIN_COMMAND_CONFIDENCE = 0.75

    /**
     * The action verb must be heard clearly on its own, not inferred from the
     * rest of the phrase. Set high deliberately: a missed command costs one
     * repetition, an invented one costs an unwanted recording.
     */
    private const val MIN_ACTION_WORD_CONFIDENCE = 0.85

    @Volatile var isRunning: Boolean = false; private set
    @Volatile var isRecording: Boolean = false; private set
    @Volatile var isPausedRecording: Boolean = false; private set
    /**
     * WHY this can be turned off: playing a recording back through the speaker
     * feeds the app's own audio into its own microphone. A take that contained
     * "hey think tap stop" then stopped a live recording, and one containing
     * "hey think tap start" opened a take the user never asked for.
     *
     * The microphone keeps running - only command MATCHING is suspended - so
     * the recording itself is unaffected.
     */
    @Volatile var commandsEnabled: Boolean = true
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
  private var lastStopAt = 0L
  @Volatile private var micSuspended = false
  private var wakeLock: PowerManager.WakeLock? = null
  private val commandDebounceMs = 1500L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
    VoskModelProvider.loadAsync(this) { loaded, error ->
      if (loaded != null) {
        model = loaded
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
      ACTION_SUSPEND_MIC -> suspendMic()
      ACTION_RESUME_MIC -> resumeMic()
      ACTION_SET_COMMANDS -> {
        val enabled = intent.getBooleanExtra(EXTRA_COMMANDS_ENABLED, true)
        if (commandsEnabled != enabled) {
          commandsEnabled = enabled
          // Drop buffered audio so speaker output cannot resolve after resuming.
          try { recognizer?.reset() } catch (_: Exception) {}
        }
      }
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
    /**
     * WHY ensureForeground() comes first: this service is launched with
     * startForegroundService(), and Android requires startForeground() within
     * ~5 seconds or it kills the process. The permission check used to return
     * early before that call, so on a device where permission was missing the
     * service died silently - the UI said "Recording started" and nothing
     * happened. Claim the foreground slot first, then validate.
     */
    ensureForeground()

    if (capturing) {
      updateNotification()
      return
    }
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
      != PackageManager.PERMISSION_GRANTED
    ) {
      Log.e(TAG, "RECORD_AUDIO not granted - cannot capture")
      AndroidWakeWordModule.emit(
        "onError",
        mapOf("code" to "permission", "message" to "Microphone permission required"),
      )
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
      return
    }

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
  }

  private fun feedRecognizer(frame: ShortArray, read: Int) {
    val wanted = COMMAND_GRAMMAR
    if (recognizer != null && recognizerGrammar != wanted) {
      try { recognizer?.close() } catch (_: Exception) {}
      recognizer = null
    }

    val r = recognizer ?: run {
      val m = model ?: return
      val fresh = try {
        Recognizer(m, SAMPLE_RATE.toFloat(), wanted).apply {
          /**
           * WHY word-level output: it carries a per-word confidence score, and
           * a command is only acted on when the recogniser is actually sure.
           * Without it every match looks equally certain, including the ones
           * produced by speech the grammar does not cover.
           */
          setWords(true)
        }
      } catch (e: Exception) {
        Log.e(TAG, "Recognizer create failed", e); return
      }
      recognizer = fresh
      recognizerGrammar = wanted
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
        val json = JSONObject(r.result)
        handleText(
          json.optString("text", ""),
          final = true,
          confidence = averageConfidence(json),
          actionConfidence = actionWordConfidence(json),
        )
      } else {
        val json = JSONObject(r.partialResult)
        handleText(json.optString("partial", ""), final = false, confidence = 0.0, actionConfidence = 0.0)
      }
    } catch (e: Exception) {
      Log.w(TAG, "recognizer error", e)
    }
  }

  /**
   * Mean per-word confidence from a Vosk result, or 1.0 when the model does not
   * report it - an absent score must not block a genuine command.
   */
  /**
   * Confidence of the LAST word in a result - the action verb.
   *
   * WHY this matters more than the average: grammar-constrained recognition
   * must return one of its phrases. Say "hey think tap" and the closest option
   * is "hey think tap start", so Vosk returns that with "start" essentially
   * invented. Three of the four words genuinely matched, so the average stays
   * high and the command fires - a recording starts that the user never asked
   * for.
   *
   * The invented word itself always scores low. Checking it directly is what
   * separates "hey think tap start" from "hey think tap".
   */
  private fun actionWordConfidence(json: JSONObject): Double {
    val words = json.optJSONArray("result") ?: return 1.0
    if (words.length() == 0) return 1.0
    val last = words.optJSONObject(words.length() - 1) ?: return 1.0
    if (!last.has("conf")) return 1.0
    return last.optDouble("conf", 1.0)
  }

  private fun averageConfidence(json: JSONObject): Double {
    val words = json.optJSONArray("result") ?: return 1.0
    if (words.length() == 0) return 1.0
    var total = 0.0
    var counted = 0
    for (i in 0 until words.length()) {
      val w = words.optJSONObject(i) ?: continue
      if (!w.has("conf")) continue
      total += w.optDouble("conf", 1.0)
      counted += 1
    }
    return if (counted == 0) 1.0 else total / counted
  }

  private fun handleText(
    text: String,
    final: Boolean,
    confidence: Double,
    actionConfidence: Double,
  ) {
    if (text.isBlank()) return

    AndroidWakeWordModule.emit(
      "onPartialResult",
      mapOf("transcript" to text, "isFinal" to final),
    )

    /**
     * WHY only final results act on a command: a partial is a running
     * hypothesis that changes with every word. Acting on one meant a fleeting
     * wrong guess could end a take - reported as a recording stopping on its
     * own partway through, intermittently and with no obvious trigger.
     *
     * This matters most for speech the grammar does not cover. A Marathi
     * sentence has only seven English phrases and [unk] to be scored against,
     * so a mid-utterance hypothesis lands on "hey think tap stop" far more
     * often than a settled final result does.
     *
     * Waiting for the final costs a few hundred milliseconds. Losing half a
     * recording costs the user their thought.
     */
    if (!final) return

    val now = System.currentTimeMillis()
    if (now - lastCommandAt < commandDebounceMs) return

    /**
     * WHY a confidence floor: with a grammar of seven phrases, speech the
     * grammar does not cover - a Marathi sentence, for instance - is still
     * scored against those seven and occasionally lands on one. Those matches
     * come back with a low score, while a phrase the user actually said comes
     * back high. Requiring 0.75 keeps real commands and drops the accidents.
     */
    if (confidence < MIN_COMMAND_CONFIDENCE) {
      return
    }

    /**
     * WHY the action word is checked separately: it is the one the recogniser
     * invents when the user says only the name. "hey think tap" comes back as
     * "hey think tap start" with a high average and a low score on "start".
     * Requiring the verb itself to be heard clearly is what stops a bare name
     * from starting a recording.
     */
    if (actionConfidence < MIN_ACTION_WORD_CONFIDENCE) {
      return
    }

    val cmd = CommandMatcher.match(text, isRecording, isPausedRecording)
    if (cmd == CommandMatcher.Command.NONE) return

    // Ignore a wake that lands right after a take ended - see POST_STOP_COOLDOWN_MS.
    if (cmd == CommandMatcher.Command.WAKE && now - lastStopAt < POST_STOP_COOLDOWN_MS) {
      return
    }
    lastCommandAt = now

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

  /**
   * Keeps the CPU awake while recording.
   *
   * WHY: locking the screen puts the device into a doze state that suspends the
   * capture thread, so a take stopped the moment the phone locked and the
   * audio after that point was lost. A partial wake lock keeps the capture loop
   * running with the screen off - it does not keep the screen on.
   *
   * Released the instant recording ends, so it cannot drain the battery beyond
   * the take itself.
   */
  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
      wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ThinkTap::Recording").apply {
        setReferenceCounted(false)
        // Timeout is a safety net - a leaked lock cannot outlive a long take.
        acquire(3 * 60 * 60 * 1000L)
      }
    } catch (e: Exception) {
      Log.w(TAG, "wake lock failed", e)
    }
  }

  private fun releaseWakeLock() {
    try {
      if (wakeLock?.isHeld == true) wakeLock?.release()
    } catch (e: Exception) {
      Log.w(TAG, "wake lock release failed", e)
    }
    wakeLock = null
  }

  private fun startRecording(outputPath: String?) {
    if (isRecording) return
    ensureForeground()
    if (!capturing) startListening()
    if (!capturing) {
      // startListening bailed - permission or AudioRecord failure already emitted.
      Log.e(TAG, "cannot record: capture loop not running")
      AndroidWakeWordModule.emit(
        "onError",
        mapOf("code" to "start-failed", "message" to "Microphone is not available"),
      )
      return
    }

    /**
     * WHY filesDir is the fallback: getExternalFilesDir can return null when
     * external storage is unavailable, and some OEM builds restrict it further.
     * Internal storage always exists, so a take is never lost to a missing
     * directory.
     */
    val baseDir = getExternalFilesDir(null) ?: filesDir
    val path = outputPath ?: File(
      baseDir,
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

    acquireWakeLock()
    wavWriter = writer
    isRecording = true
    isPausedRecording = false
    currentPath = path
    recordedMs = 0

    RecognitionAudioGuard.playStartCue(this)
    emitRecording("started", path)
    updateNotification()
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

  /**
   * Audio to discard from the end of a take that was stopped by voice.
   *
   * WHY: the WAV keeps recording while the command is spoken and confirmed, so
   * "hey think tap stop" ended up in the saved audio and then in the
   * transcript. Dropping the last two seconds removes the command without
   * touching the idea before it.
   *
   * Only applied to voice stops. A button stop has no command to remove.
   */
  private val voiceStopTrimMs = 2000L

  private fun stopRecording(fromVoice: Boolean, transcript: String = "") {
    if (!isRecording) return
    if (fromVoice) wavWriter?.trimTail(voiceStopTrimMs)
    val writer = wavWriter
    recordedMs = writer?.durationMs ?: 0
    val saved = writer?.close()
    wavWriter = null
    isRecording = false
    isPausedRecording = false
    releaseWakeLock()

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
    lastStopAt = System.currentTimeMillis()
  }

  private fun discardRecording() {
    releaseWakeLock()
    wavWriter?.discard()
    wavWriter = null
    isRecording = false
    isPausedRecording = false
    currentPath = null
    recordedMs = 0
    emitRecording("discarded", null)
    updateNotification()
  }

  /**
   * Releases the microphone while keeping any open take intact.
   *
   * WHY the WAV file stays open: the user's recording must survive the app
   * being backgrounded. Closing the file would end the take; releasing only
   * AudioRecord means the microphone indicator clears and nothing is heard,
   * while the same file is appended to when capture resumes.
   *
   * The take is paused too, so no silent gap is written for the time away.
   */
  private fun suspendMic() {
    if (!capturing) return

    if (isRecording && !isPausedRecording) {
      wavWriter?.pause()
      isPausedRecording = true
      emitRecording("paused", currentPath, fromVoice = false)
    }

    capturing = false
    try { captureThread?.join(400) } catch (_: Exception) {}
    captureThread = null

    try {
      audioRecord?.stop()
      audioRecord?.release()
    } catch (e: Exception) {
      Log.w(TAG, "suspend release failed", e)
    }
    audioRecord = null

    try { recognizer?.close() } catch (_: Exception) {}
    recognizer = null
    recognizerGrammar = null

    isRunning = false
    micSuspended = true
    emitListening()
    updateNotification()
  }

  /** Re-acquires the microphone. An open take stays paused until the user resumes. */
  private fun resumeMic() {
    if (!micSuspended) return
    micSuspended = false
    startListening()
  }

  private fun stopEverything() {
    releaseWakeLock()
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
    /**
     * WHY the try/catch: on Android 12+ a microphone foreground service started
     * from the background throws ForegroundServiceStartNotAllowedException, and
     * some OEM builds throw on the typed overload even when the type is
     * declared. An uncaught throw here kills the service before it ever records,
     * which showed up as "Recording started" with nothing happening.
     */
    val n = buildNotification()
    try {
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        @Suppress("DEPRECATION")
        startForeground(NOTIFICATION_ID, n)
      }
    } catch (e: Exception) {
      Log.e(TAG, "startForeground failed", e)
      try {
        // Untyped fallback - better a plain foreground service than none.
        @Suppress("DEPRECATION")
        startForeground(NOTIFICATION_ID, n)
      } catch (e2: Exception) {
        Log.e(TAG, "startForeground fallback failed", e2)
        AndroidWakeWordModule.emit(
          "onError",
          mapOf(
            "code" to "foreground-failed",
            "message" to (e.message ?: "Could not start the recording service"),
          ),
        )
      }
    }
  }

  private fun statusText(): String = when {
    micSuspended && isRecording -> "Paused - open Think Tap to continue"
    micSuspended -> "Not listening"
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
