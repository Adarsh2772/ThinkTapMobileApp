package expo.modules.androidwakeword

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

/**
 * Recording start cue + brief suppression of SpeechRecognizer UI chimes.
 *
 * Never changes [AudioManager.getRingerMode] / Silent Mode / DND.
 * Volume tweaks (if any) are temporary and always restored — they must not linger
 * after the app is closed or while a take is recording.
 */
object RecognitionAudioGuard {
  private const val TAG = "ThinkTapAudioGuard"
  private val lock = Any()
  private val mainHandler = Handler(Looper.getMainLooper())
  private val savedVolumes = mutableMapOf<Int, Int>()
  @Volatile
  private var muted = false
  private var restoreRunnable: Runnable? = null

  /** Streams that carry SpeechRecognizer start chimes on many OEMs (not ringer mode). */
  private fun chimeStreams(): IntArray {
    val list = mutableListOf(
      AudioManager.STREAM_SYSTEM,
      AudioManager.STREAM_NOTIFICATION,
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      list.add(AudioManager.STREAM_ACCESSIBILITY)
    }
    return list.toIntArray()
  }

  fun cancelVibrator(context: Context) {
    try {
      vibrator(context)?.cancel()
    } catch (_: Exception) {
      // ignore
    }
  }

  /**
   * API compatibility — does not leave the device muted.
   * Cancels haptic only.
   */
  fun mute(context: Context) {
    cancelVibrator(context)
  }

  /** Restore any brief chime suppression and cancel leftover haptic. */
  fun restore(context: Context) {
    cancelVibrator(context)
    restoreVolumesNow(context.applicationContext)
  }

  /**
   * Briefly suppress recognition UI chimes around [block], then always restore.
   * Does not set ringer mode / Silent Mode / DND.
   */
  fun runWithChimesSuppressed(context: Context, block: () -> Unit) {
    val app = context.applicationContext
    suppressChimesBriefly(app)
    try {
      block()
    } finally {
      // Restore after the OEM chime window; never leave volumes down.
      mainHandler.postDelayed({ restoreVolumesNow(app) }, 350)
    }
  }

  private fun suppressChimesBriefly(app: Context) {
    synchronized(lock) {
      try {
        restoreRunnable?.let { mainHandler.removeCallbacks(it) }
        restoreRunnable = null
        val am = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        cancelVibrator(app)
        if (!muted) {
          savedVolumes.clear()
          for (stream in chimeStreams()) {
            savedVolumes[stream] = am.getStreamVolume(stream)
          }
          muted = true
        }
        for (stream in chimeStreams()) {
          try {
            am.setStreamVolume(stream, 0, 0)
          } catch (_: Exception) {
            // Some OEMs block individual streams.
          }
        }
        // Safety net: always restore even if caller is killed mid-flight.
        val r = Runnable { restoreVolumesNow(app) }
        restoreRunnable = r
        mainHandler.postDelayed(r, 800)
      } catch (e: Exception) {
        Log.w(TAG, "suppressChimesBriefly", e)
      }
    }
  }

  private fun restoreVolumesNow(app: Context) {
    synchronized(lock) {
      restoreRunnable?.let { mainHandler.removeCallbacks(it) }
      restoreRunnable = null
      if (!muted) return
      try {
        val am = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        for ((stream, volume) in savedVolumes) {
          try {
            am.setStreamVolume(stream, volume, 0)
          } catch (_: Exception) {
            // ignore
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "restoreVolumesNow", e)
      }
      savedVolumes.clear()
      muted = false
    }
  }

  /** Short vibrate + optional tone when a take starts — does not change ringer mode. */
  fun playStartCue(context: Context) {
    val app = context.applicationContext
    restoreVolumesNow(app)
    try {
      val vibrator = vibrator(app)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 90, 60, 90), -1))
      } else {
        @Suppress("DEPRECATION")
        vibrator?.vibrate(longArrayOf(0, 90, 60, 90), -1)
      }
    } catch (e: Exception) {
      Log.w(TAG, "vibrate", e)
    }

    try {
      val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 85)
      tone.startTone(ToneGenerator.TONE_PROP_ACK, 220)
      mainHandler.postDelayed({
        try {
          tone.stopTone()
          tone.release()
        } catch (_: Exception) {
          // ignore
        }
      }, 280)
    } catch (e: Exception) {
      Log.w(TAG, "tone", e)
    }
  }

  private fun vibrator(context: Context): Vibrator? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
  }
}
