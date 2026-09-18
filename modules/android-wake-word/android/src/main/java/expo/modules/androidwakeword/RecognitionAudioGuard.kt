package expo.modules.androidwakeword

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.util.Log

/**
 * WHY this whole class is now a no-op.
 *
 * This existed to suppress the OEM "recognizer chime" that Android's
 * SpeechRecognizer plays on some devices (OPPO/ColorOS especially) when a
 * voice-recognition session starts or stops. That chime comes from Android's
 * SpeechRecognizer API specifically.
 *
 * This app does not use SpeechRecognizer. Audio capture is AudioRecord + an
 * offline Vosk model - see AudioCaptureService. There is no recognizer chime
 * to suppress, and never has been in this architecture.
 *
 * What this guard actually did instead: every recording start and stop
 * called muteRecognizerCue(), which force-set SIX audio streams to volume 0 -
 * STREAM_SYSTEM, STREAM_NOTIFICATION, STREAM_RING, STREAM_ALARM,
 * STREAM_DTMF, and STREAM_MUSIC - saving the prior levels to restore later.
 * That is the client's #1, recurring complaint: ringtone silenced, video and
 * music audio silenced, every time the wake word or a recording activated.
 *
 * It was also unrecoverable without reinstalling. The restore only ran on an
 * explicit unmute call. If the app was backgrounded or killed while muted -
 * completely normal for an app that had just muted the ringtone and was then
 * about to receive the call it just silenced - savedVolumes was lost with
 * the process, and the streams stayed at zero permanently. Only uninstalling
 * (which resets stream volumes as an OS side effect) brought sound back,
 * exactly as reported.
 *
 * The fix is to stop doing this at all, not to tune which streams get muted
 * or for how long. Every public method below is kept, so every call site in
 * AudioCaptureService.kt and the module bridge still compiles unchanged -
 * they simply no longer do anything.
 */
object RecognitionAudioGuard {
  private const val TAG = "ThinkTapAudioGuard"

  fun muteRecognizerCue(context: Context) {}

  fun unmuteRecognizerCue(context: Context) {}

  fun restore(context: Context) {}

  fun swallowRecognizerCue(context: Context) {}

  fun cancelRecognizerHaptic(context: Context) {}

  fun playStartCue(context: Context) {}

  fun playStopCue(context: Context) {}

  /**
   * One-time repair for a device that is already stuck muted from a build
   * before this fix. Unconditionally restores the six streams the old code
   * used to force to zero, to a sane audible default - not to a "remembered"
   * prior value, because the old saved-volume state that would have recorded
   * that is long gone (lost the moment the app was backgrounded or killed
   * while muted, which is exactly how devices ended up stuck in the first
   * place).
   *
   * Deliberately idempotent and harmless to call on a device that was never
   * affected: it only ever raises a stream already at zero, and does nothing
   * to a stream already above zero.
   */
  fun repairStuckMute(context: Context) {
    try {
      val am = context.applicationContext.getSystemService(Context.AUDIO_SERVICE)
        as? AudioManager ?: return
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return

      val streams = intArrayOf(
        AudioManager.STREAM_SYSTEM,
        AudioManager.STREAM_NOTIFICATION,
        AudioManager.STREAM_RING,
        AudioManager.STREAM_ALARM,
        AudioManager.STREAM_DTMF,
        AudioManager.STREAM_MUSIC,
      )

      for (stream in streams) {
        try {
          val current = am.getStreamVolume(stream)
          if (current <= 0) {
            val max = am.getStreamMaxVolume(stream)
            // Restore to roughly a third of max - audible, not jarringly
            // loud, and never touches a stream the user had already set
            // above zero themselves.
            val target = (max / 3).coerceAtLeast(1)
            am.setStreamVolume(stream, target, 0)
            Log.i(TAG, "repairStuckMute: stream=$stream restored 0 -> $target")
          }
        } catch (e: Exception) {
          Log.w(TAG, "repairStuckMute: stream=$stream failed", e)
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "repairStuckMute failed", e)
    }
  }
}
