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
    const val EXTRA_SPEECH_LOCALE = "speechLocale"

    /** Minimum gap between startListening calls — prevents beep spam / CPU thrash. */
    private const val MIN_START_INTERVAL_MS = 4500L
    /** After idle/no-match, wait before listening again. */
    private const val RESTART_IDLE_MS = 5000L
    /** After client/busy errors. */
    private const val RESTART_ERROR_MS = 6000L
    /** After permission / unavailable. */
    private const val RESTART_HARD_MS = 10000L

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
      "start recoding",
      "hey think tap start",
      // Marathi
      "रेकॉर्डिंग सुरू करा",
      "रेकॉर्डिंग सुरु करा",
      "रेकॉर्डिंग चालू करा",
      "सुरू करा",
      "हे थिंक टॅप",
      "थिंक टॅप",
      // Hindi
      "रिकॉर्डिंग शुरू करो",
      "रिकॉर्डिंग शुरू करें",
      "रिकॉर्डिंग शुरू कर",
      "शुरू करो",
      "शुरू करें",
      // Tamil
      "ரெக்கார்டிங் தொடங்கு",
      "பதிவு தொடங்கு",
      "பதிவு செய்",
      "தொடங்கு",
      // Telugu
      "రికార్డింగ్ ప్రారంభించు",
      "రికార్డింగ్ మొదలు పెట్టు",
      "ప్రారంభించు",
      "మొదలు పెట్టు",
      // Bengali
      "রেকর্ডিং শুরু করুন",
      "রেকর্ডিং শুরু করো",
      "শুরু করুন",
      "শুরু করো",
      // Gujarati
      "રેકોર્ડિંગ શરૂ કરો",
      "રેકોર્ડિંગ શરુ કરો",
      "શરૂ કરો",
      // Kannada
      "ರೆಕಾರ್ಡಿಂಗ್ ಪ್ರಾರಂಭಿಸಿ",
      "ರೆಕಾರ್ಡಿಂಗ್ ಶುರು ಮಾಡಿ",
      "ಪ್ರಾರಂಭಿಸಿ",
      "ಶುರು ಮಾಡಿ",
      // Malayalam
      "റെക്കോർഡിംഗ് ആരംഭിക്കുക",
      "റെക്കോർഡിംഗ് തുടങ്ങുക",
      "ആരംഭിക്കുക",
      "തുടങ്ങുക",
      // Punjabi
      "ਰਿਕਾਰਡਿੰਗ ਸ਼ੁਰੂ ਕਰੋ",
      "ਰਿਕਾਰਡਿੰਗ ਸ਼ੁਰੂ ਕਰੋ",
      "ਸ਼ੁਰੂ ਕਰੋ",
      // Odia
      "ରେକର୍ଡିଂ ଆରମ୍ଭ କରନ୍ତୁ",
      "ରେକର୍ଡିଂ ଶୁରୁ କର",
      "ଆରମ୍ଭ କର",
      // Assamese
      "ৰেকৰ্ডিং আৰম্ভ কৰক",
      "ৰেকৰ্ডিং আৰম্ভ কৰা",
      "আৰম্ভ কৰক",
      // Urdu
      "ریکارڈنگ شروع کریں",
      "ریکارڈنگ شروع کرو",
      "شروع کریں",
      "شروع کرو",
      // Romanized
      "recording suru kara",
      "rekording suru kara",
      "recording shuru karo",
      "recording thodangu",
      "recording prarambhinchu",
    )

    fun normalize(text: String): String =
      text.lowercase()
        .replace(
          Regex("[^a-z0-9\\s\\u0600-\\u06FF\\u0900-\\u097F\\u0980-\\u09FF\\u0A00-\\u0A7F\\u0A80-\\u0AFF\\u0B00-\\u0B7F\\u0B80-\\u0BFF\\u0C00-\\u0C7F\\u0C80-\\u0CFF\\u0D00-\\u0D7F]"),
          " ",
        )
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
  private var hasForeground = false
  private var recognitionLocale: String = "en-US"

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    // Android requires startForeground() within ~5s of startForegroundService().
    promoteForeground("Listening for Hey Think Tap…")
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
        if (!hasForeground) {
          try {
            promoteForeground("Stopping…")
          } catch (_: Exception) {
            // ignore
          }
        }
        // Always leave the user's ringer / notification volumes untouched.
        stopInternal(restoreAudio = true)
        return START_NOT_STICKY
      }
      ACTION_PAUSE -> {
        isPaused = true
        promoteForeground("Paused while recording")
        stopRecognitionOnly()
        // Destroy the recognizer so the mic is fully released for idea capture STT.
        destroyRecognizer()
        RecognitionAudioGuard.cancelVibrator(this)
        updateNotification("Paused while recording")
        AndroidWakeWordModule.emit(
          "onListeningChange",
          mapOf("listening" to false, "paused" to true),
        )
        // Not sticky — if the app is swiped away, do not keep restarting recognition beeps.
        return START_NOT_STICKY
      }
      ACTION_RESUME -> {
        isPaused = false
        promoteForeground("Listening for Hey Think Tap…")
        RecognitionAudioGuard.cancelVibrator(this)
        updateNotification("Listening for Hey Think Tap…")
        scheduleRestart(MIN_START_INTERVAL_MS)
        return START_NOT_STICKY
      }
      else -> {
        // START or null (system restart)
        val fromPrefs = getSharedPreferences("thinktap_wake", MODE_PRIVATE)
          .getString("speech_locale", "en-US")
          ?: "en-US"
        recognitionLocale = intent?.getStringExtra(EXTRA_SPEECH_LOCALE)?.trim()
          ?.takeIf { it.isNotEmpty() }
          ?: fromPrefs
        isPaused = false
        isRunning = true
        hasStopped = false
        promoteForeground("Listening for Hey Think Tap…")
        RecognitionAudioGuard.cancelVibrator(this)
        updateNotification("Listening for Hey Think Tap…")
        AndroidWakeWordModule.emit(
          "onListeningChange",
          mapOf("listening" to true, "paused" to false),
        )
        scheduleRestart(800)
        // START_NOT_STICKY: closing/force-stopping the app must end listening.
        // START_STICKY was restarting SpeechRecognizer in the background (continuous beeps).
        return START_NOT_STICKY
      }
    }
  }

  override fun onDestroy() {
    if (!hasStopped) {
      stopInternal(restoreAudio = true)
    }
    super.onDestroy()
  }

  private fun promoteForeground(text: String) {
    lastNotificationText = text
    val notification = buildNotification(text)
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
    hasForeground = true
  }

  private fun ensureForeground() {
    promoteForeground(lastNotificationText ?: "Listening for Hey Think Tap…")
  }

  private fun stopInternal(@Suppress("UNUSED_PARAMETER") restoreAudio: Boolean = true) {
    if (hasStopped) return
    hasStopped = true
    isRunning = false
    isPaused = false
    listeningActive = false
    cancelRestart()
    destroyRecognizer()
    // Never leave stream volumes muted; ringer mode stays as the user left it.
    RecognitionAudioGuard.restore(this)
    if (hasForeground) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      hasForeground = false
    }
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
   * Best-effort cancel of leftover haptic from recognition UI.
   * Does not change system volume or Silent Mode.
   */
  private fun silenceSpeechUi() {
    RecognitionAudioGuard.cancelVibrator(this)
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

      lastStartAt = System.currentTimeMillis()
      listeningActive = true

      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, recognitionLocale)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        putExtra("android.speech.extra.DICTATION_MODE", true)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 8000L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 8000L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 1500L)
      }
      // Brief chime suppress only around startListening — volumes always restored after.
      RecognitionAudioGuard.runWithChimesSuppressed(this) {
        recognizer.startListening(intent)
      }
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
    RecognitionAudioGuard.cancelVibrator(this)
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
