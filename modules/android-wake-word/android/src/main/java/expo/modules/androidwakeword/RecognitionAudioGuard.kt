package expo.modules.androidwakeword

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.SparseIntArray

/**
 * Suppress OEM SpeechRecognizer start chimes (OPPO / ColorOS / Vivo / Android 11+).
 *
 * ADJUST_MUTE alone is not enough on many Android 11 OEMs — they still play the
 * recognizer “tik” on SYSTEM/NOTIFICATION. Always re-apply mute + force volume=0
 * (saving prior volumes for restore). Stay muted for the whole listen window.
 *
 * Start/stop confirmation is UI toast only — [playStartCue] / [playStopCue]
 * are intentional no-ops (no tone, no haptic).
 */
object RecognitionAudioGuard {
  private const val TAG = "ThinkTapAudioGuard"
  private val lock = Any()
  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile
  private var cueMuted = false

  /** Stream volumes saved before volume-0 fallback; restored on full release. */
  private val savedVolumes = SparseIntArray()

  fun muteRecognizerCue(context: Context) {
    val app = context.applicationContext
    val run = {
      synchronized(lock) {
        // Always re-apply — ColorOS can unmute between SpeechRecognizer restarts.
        applyMute(app)
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) run() else mainHandler.post(run)
  }

  fun unmuteRecognizerCue(context: Context) {
    val app = context.applicationContext
    val run = {
      synchronized(lock) {
        applyUnmute(app)
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) run() else mainHandler.post(run)
  }

  fun restore(context: Context) {
    unmuteRecognizerCue(context)
  }

  /** JS silenceRecognitionUi — mute OEM SpeechRecognizer chimes. */
  fun swallowRecognizerCue(context: Context) {
    muteRecognizerCue(context)
  }

  fun cancelRecognizerHaptic(@Suppress("UNUSED_PARAMETER") context: Context) {}

  /** Recording started — UI toast only; no sound / vibration. */
  fun playStartCue(context: Context) {
    muteRecognizerCue(context)
  }

  /** Recording stopped — UI toast only; no sound / vibration. */
  fun playStopCue(context: Context) {
    muteRecognizerCue(context)
  }

  private fun applyMute(app: Context) {
    val am = app.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    muteStreams(am)
    enforceSilent(am)
    cueMuted = true
  }

  private fun applyUnmute(app: Context) {
    val am = app.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    restoreVolumes(am)
    unmuteStreams(am)
    cueMuted = false
  }

  private fun muteStreams(am: AudioManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val flags = AudioManager.FLAG_REMOVE_SOUND_AND_VIBRATE
    for (stream in cueStreams()) {
      try {
        am.adjustStreamVolume(stream, AudioManager.ADJUST_MUTE, flags)
      } catch (_: Exception) {
        // volume fallback in enforceSilent
      }
    }
  }

  private fun unmuteStreams(am: AudioManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val flags = AudioManager.FLAG_REMOVE_SOUND_AND_VIBRATE
    for (stream in cueStreams()) {
      try {
        am.adjustStreamVolume(stream, AudioManager.ADJUST_UNMUTE, flags)
      } catch (_: Exception) {
        // ignore
      }
    }
  }

  /**
   * ColorOS / Android 11: ADJUST_MUTE may report success while the stream is
   * still audible. Force volume to 0 once and remember the prior level.
   */
  private fun enforceSilent(am: AudioManager) {
    for (stream in cueStreams()) {
      try {
        val muted = try {
          am.isStreamMute(stream)
        } catch (_: Exception) {
          false
        }
        val volume = try {
          am.getStreamVolume(stream)
        } catch (_: Exception) {
          0
        }
        if (!muted || volume > 0) {
          if (volume > 0 && savedVolumes.indexOfKey(stream) < 0) {
            savedVolumes.put(stream, volume)
          }
          if (volume > 0) {
            am.setStreamVolume(stream, 0, 0)
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "enforceSilent stream=$stream", e)
      }
    }
  }

  private fun restoreVolumes(am: AudioManager) {
    for (i in 0 until savedVolumes.size()) {
      val stream = savedVolumes.keyAt(i)
      val volume = savedVolumes.valueAt(i)
      try {
        val maxVol = am.getStreamMaxVolume(stream)
        am.setStreamVolume(stream, volume.coerceIn(0, maxVol), 0)
      } catch (e: Exception) {
        Log.w(TAG, "restoreVolumes stream=$stream", e)
      }
    }
    savedVolumes.clear()
  }

  private fun cueStreams(): IntArray {
    // Include MUSIC — some ColorOS builds route recognizer cues there on API 30.
    return intArrayOf(
      AudioManager.STREAM_SYSTEM,
      AudioManager.STREAM_NOTIFICATION,
      AudioManager.STREAM_RING,
      AudioManager.STREAM_ALARM,
      AudioManager.STREAM_DTMF,
      AudioManager.STREAM_MUSIC,
    )
  }
}
