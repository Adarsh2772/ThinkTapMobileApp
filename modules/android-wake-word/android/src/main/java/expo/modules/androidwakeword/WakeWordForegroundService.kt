package expo.modules.androidwakeword

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Foreground microphone service that listens for "Hey Think Tap" (and variants)
 * while the app is minimized. On match: brings Think Tap to the foreground.
 *
 * Designed to avoid:
 * - Constant recognition-start beeps (mute system ding + longer sessions)
 * - Battery / hang from tight restart loops
 * - Notification sounds on each restart
 */
class WakeWordForegroundService : Service() {
  companion object {
    const val TAG = "ThinkTapWakeWord"
    /** New silent channel — old channel may have been created with sound on some OEMs. */
    const val CHANNEL_ID = "thinktap_wake_word_v3_silent"
    const val NOTIFICATION_ID = 7101

    const val ACTION_START = "expo.modules.androidwakeword.START"
    const val ACTION_STOP = "expo.modules.androidwakeword.STOP"
    const val ACTION_PAUSE = "expo.modules.androidwakeword.PAUSE"
    const val ACTION_RESUME = "expo.modules.androidwakeword.RESUME"

    const val EXTRA_WAKE_TRIGGERED = "wakeWordTriggered"
    const val EXTRA_WAKE_TRANSCRIPT = "wakeTranscript"
    const val EXTRA_KEEP_SILENT = "keepSilent"

    /** Minimum gap between startListening calls — prevents beep spam / CPU thrash. */
    private const val MIN_START_INTERVAL_MS = 2800L
    /** After idle/no-match, wait before listening again. */
    private const val RESTART_IDLE_MS = 3200L
    /** After client/busy errors. */
    private const val RESTART_ERROR_MS = 4500L
    /** After permission / unavailable. */
    private const val RESTART_HARD_MS = 8000L

    @Volatile
    var isRunning: Boolean = false
      private set

    @Volatile
    var isPaused: Boolean = false
      private set

    private val WAKE_PHRASES = listOf(
      "hey think tap",
      "hey thinktap",
      "hey think app",
      "hey thinktab",
      "a think tap",
      "hey thin tap",
      "hey thing tap",
      "hi think tap",
      "hey think that",
      "hey think cap",
      "hey think top",
      "think tap",
      "thinktap",
      "think app",
      "start recording",
      "start record",
      "hey think tap start",
    )

    fun normalize(text: String): String =
      text.lowercase()
        .replace(Regex("[^a-z0-9\\s]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()

    fun matchesWakePhrase(text: String): Boolean {
      val n = normalize(text)
      if (n.isEmpty()) return false
      return WAKE_PHRASES.any { phrase -> n == phrase || n.contains(phrase) }
    }
  }

  private val mainHandler = Handler(Looper.getMainLooper())
  private var speechRecognizer: SpeechRecognizer? = null
  private var restartRunnable: Runnable? = null
  private var lastTriggerAt = 0L
  private var lastStartAt = 0L
  private var consecutiveErrors = 0
  private var lastNotificationText: String? = null
  private var listeningActive = false
  private var hasStopped = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    // Best-effort: remove legacy noisy channel if present.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      try {
        val mgr = getSystemService(NotificationManager::class.java)
        mgr?.deleteNotificationChannel("thinktap_wake_word")
        mgr?.deleteNotificationChannel("thinktap_wake_word_v2_silent")
      } catch (_: Exception) {
        // ignore
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        val keepSilent = intent.getBooleanExtra(EXTRA_KEEP_SILENT, false)
        stopInternal(restoreAudio = !keepSilent)
        return START_NOT_STICKY
      }
      ACTION_PAUSE -> {
        isPaused = true
        stopRecognitionOnly()
        // Destroy the recognizer so the mic is fully released for idea capture STT.
        destroyRecognizer()
        // Stay muted so capture STT does not chime/vibrate on start.
        RecognitionAudioGuard.mute(this)
        updateNotification("Paused while recording")
        AndroidWakeWordModule.emit(
          "onListeningChange",
          mapOf("listening" to false, "paused" to true),
        )
        return START_STICKY
      }
      ACTION_RESUME -> {
        isPaused = false
        ensureForeground()
        RecognitionAudioGuard.mute(this)
        updateNotification("Listening for Hey Think Tap…")
        scheduleRestart(MIN_START_INTERVAL_MS)
        return START_STICKY
      }
      else -> {
        // START or null (system restart)
        isPaused = false
        isRunning = true
        hasStopped = false
        ensureForeground()
        RecognitionAudioGuard.mute(this)
        updateNotification("Listening for Hey Think Tap…")
        AndroidWakeWordModule.emit(
          "onListeningChange",
          mapOf("listening" to true, "paused" to false),
        )
        scheduleRestart(800)
        return START_STICKY
      }
    }
  }

  override fun onDestroy() {
    if (!hasStopped) {
      stopInternal(restoreAudio = true)
    }
    super.onDestroy()
  }

  private fun ensureForeground() {
    val notification = buildNotification(lastNotificationText ?: "Listening for Hey Think Tap…")
    if (Build.VERSION.SDK_INT >= 34) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
      )
    } else {
      @Suppress("DEPRECATION")
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopInternal(restoreAudio: Boolean = true) {
    if (hasStopped) return
    hasStopped = true
    isRunning = false
    isPaused = false
    listeningActive = false
    cancelRestart()
    destroyRecognizer()
    if (restoreAudio) {
      RecognitionAudioGuard.restore(this)
    } else {
      RecognitionAudioGuard.mute(this)
    }
    stopForeground(STOP_FOREGROUND_REMOVE)
    AndroidWakeWordModule.emit(
      "onListeningChange",
      mapOf("listening" to false, "paused" to false),
    )
    stopSelf()
  }

  private fun stopRecognitionOnly() {
    cancelRestart()
    listeningActive = false
    try {
      speechRecognizer?.stopListening()
    } catch (_: Exception) {
      // ignore
    }
    try {
      speechRecognizer?.cancel()
    } catch (_: Exception) {
      // ignore
    }
  }

  private fun cancelRestart() {
    restartRunnable?.let { mainHandler.removeCallbacks(it) }
    restartRunnable = null
  }

  private fun scheduleRestart(delayMs: Long) {
    cancelRestart()
    if (!isRunning || isPaused) return
    val r = Runnable { startRecognition() }
    restartRunnable = r
    mainHandler.postDelayed(r, delayMs.coerceAtLeast(MIN_START_INTERVAL_MS))
  }

  private fun destroyRecognizer() {
    try {
      speechRecognizer?.setRecognitionListener(null)
      speechRecognizer?.cancel()
      speechRecognizer?.destroy()
    } catch (e: Exception) {
      Log.w(TAG, "destroyRecognizer", e)
    }
    speechRecognizer = null
  }

  private fun ensureRecognizer(): SpeechRecognizer? {
    if (!SpeechRecognizer.isRecognitionAvailable(this)) return null
    speechRecognizer?.let { return it }
    return try {
      val recognizer = SpeechRecognizer.createSpeechRecognizer(this)
      recognizer.setRecognitionListener(listener)
      speechRecognizer = recognizer
      recognizer
    } catch (e: Exception) {
      Log.e(TAG, "createSpeechRecognizer failed", e)
      null
    }
  }

  /**
   * Mute SpeechRecognizer start chimes for the whole listen session.
   * Volumes stay down until the service stops (or JS plays the start-recording cue).
   */
  private fun silenceSpeechUi() {
    RecognitionAudioGuard.cancelVibrator(this)
    RecognitionAudioGuard.mute(this)
  }

  private fun startRecognition() {
    if (!isRunning || isPaused) return
    if (listeningActive) return

    val now = System.currentTimeMillis()
    val sinceLast = now - lastStartAt
    if (sinceLast < MIN_START_INTERVAL_MS) {
      scheduleRestart(MIN_START_INTERVAL_MS - sinceLast)
      return
    }

    if (!SpeechRecognizer.isRecognitionAvailable(this)) {
      AndroidWakeWordModule.emit(
        "onError",
        mapOf("code" to "unavailable", "message" to "Speech recognition not available"),
      )
      scheduleRestart(RESTART_HARD_MS)
      return
    }

    val recognizer = ensureRecognizer()
    if (recognizer == null) {
      AndroidWakeWordModule.emit(
        "onError",
        mapOf("code" to "start-failed", "message" to "Could not create speech recognizer"),
      )
      scheduleRestart(RESTART_ERROR_MS)
      return
    }

    try {
      try {
        recognizer.cancel()
      } catch (_: Exception) {
        // ignore
      }

      silenceSpeechUi()
      lastStartAt = System.currentTimeMillis()
      listeningActive = true

      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        putExtra("android.speech.extra.DICTATION_MODE", true)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 8000L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 8000L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1500L)
      }
      recognizer.startListening(intent)
    } catch (e: Exception) {
      listeningActive = false
      Log.e(TAG, "startRecognition failed", e)
      destroyRecognizer()
      AndroidWakeWordModule.emit(
        "onError",
        mapOf("code" to "start-failed", "message" to (e.message ?: "start failed")),
      )
      consecutiveErrors += 1
      val backoff = (RESTART_ERROR_MS * (1 + consecutiveErrors.coerceAtMost(4))).coerceAtMost(20000L)
      scheduleRestart(backoff)
    }
  }

  private val listener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) {
      silenceSpeechUi()
    }

    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}

    override fun onEndOfSpeech() {
      listeningActive = false
    }

    override fun onError(error: Int) {
      listeningActive = false
      silenceSpeechUi()

      val soft =
        error == SpeechRecognizer.ERROR_NO_MATCH ||
          error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT

      if (soft) {
        consecutiveErrors = 0
      } else {
        consecutiveErrors += 1
        Log.w(TAG, "SpeechRecognizer error=$error")
      }

      val delay = when (error) {
        SpeechRecognizer.ERROR_NO_MATCH,
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT,
        -> RESTART_IDLE_MS
        SpeechRecognizer.ERROR_CLIENT,
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY,
        -> RESTART_ERROR_MS + consecutiveErrors * 500L
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
          AndroidWakeWordModule.emit(
            "onError",
            mapOf("code" to "permission", "message" to "Microphone permission required"),
          )
          RESTART_HARD_MS
        }
        else -> RESTART_ERROR_MS
      }
      scheduleRestart(delay.coerceAtMost(20000L))
    }

    override fun onResults(results: Bundle?) {
      listeningActive = false
      consecutiveErrors = 0
      handleTranscripts(results, isFinal = true)
    }

    override fun onPartialResults(partialResults: Bundle?) {
      handleTranscripts(partialResults, isFinal = false)
    }

    override fun onEvent(eventType: Int, params: Bundle?) {}
  }

  private fun handleTranscripts(results: Bundle?, isFinal: Boolean) {
    val texts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: run {
      if (isFinal) scheduleRestart(RESTART_IDLE_MS)
      return
    }
    for (raw in texts) {
      if (raw.isNullOrBlank()) continue
      AndroidWakeWordModule.emit(
        "onPartialResult",
        mapOf("transcript" to raw, "isFinal" to isFinal),
      )
      if (matchesWakePhrase(raw)) {
        onWakeDetected(raw)
        return
      }
    }
    if (isFinal) {
      scheduleRestart(RESTART_IDLE_MS)
    }
  }

  private fun onWakeDetected(transcript: String) {
    val now = System.currentTimeMillis()
    if (now - lastTriggerAt < 3500) {
      scheduleRestart(RESTART_IDLE_MS)
      return
    }
    lastTriggerAt = now

    Log.i(TAG, "Wake phrase detected: $transcript")
    isPaused = true
    listeningActive = false
    stopRecognitionOnly()
    RecognitionAudioGuard.mute(this)
    updateNotification("Wake word heard — opening Think Tap…")

    getSharedPreferences("thinktap_wake", Context.MODE_PRIVATE)
      .edit()
      .putBoolean("pending", true)
      .putString("transcript", transcript)
      .putLong("at", now)
      .apply()

    AndroidWakeWordModule.emit(
      "onWakeDetected",
      mapOf("transcript" to transcript),
    )

    bringAppToForeground(transcript)
  }

  private fun bringAppToForeground(transcript: String) {
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
      )
      putExtra(EXTRA_WAKE_TRIGGERED, true)
      putExtra(EXTRA_WAKE_TRANSCRIPT, transcript)
    }
    if (launch != null) {
      startActivity(launch)
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val mgr = getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Hey Think Tap (silent)",
      NotificationManager.IMPORTANCE_MIN,
    ).apply {
      description = "Quiet background listening for Hey Think Tap — no sound"
      setShowBadge(false)
      enableVibration(false)
      setSound(null, null)
      lockscreenVisibility = Notification.VISIBILITY_SECRET
    }
    mgr.createNotificationChannel(channel)
  }

  private fun buildNotification(content: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pending = PendingIntent.getActivity(
      this,
      0,
      launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Think Tap")
      .setContentText(content)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentIntent(pending)
      .setOngoing(true)
      .setSilent(true)
      .setOnlyAlertOnce(true)
      .setSound(null)
      .setVibrate(null)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setVisibility(NotificationCompat.VISIBILITY_SECRET)
      .build()
  }

  private fun updateNotification(content: String) {
    if (content == lastNotificationText) return
    lastNotificationText = content
    val mgr = getSystemService(NotificationManager::class.java) ?: return
    mgr.notify(NOTIFICATION_ID, buildNotification(content))
  }
}
