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
 * Listening must never vibrate or mute the phone.
 *
 * Vivo (and similar OEMs) haptic on stream-volume changes, so we do **not**
 * mute SYSTEM/MUSIC around SpeechRecognizer restarts. The only app-owned
 * haptic is [playStartCue] / [playStopCue] when the user starts or stops a take.
 */
object RecognitionAudioGuard {
  private const val TAG = "ThinkTapAudioGuard"
  private const val PREFS = "thinktap_audio_guard"
  private const val PREFS_RECOVERED = "legacy_mute_recovered"
  private val lock = Any()
  private val mainHandler = Handler(Looper.getMainLooper())
  @Volatile
  private var recoveredLegacyMute = false

  /** No-op. Muting streams on listen-restart caused continuous haptic on Vivo. */
  fun swallowRecognizerCue(@Suppress("UNUSED_PARAMETER") context: Context) {}

  fun cancelRecognizerHaptic(@Suppress("UNUSED_PARAMETER") context: Context) {}

  fun restore(context: Context) {
    val app = context.applicationContext
    if (Looper.myLooper() == Looper.getMainLooper()) {
      recoverLegacyMuteOnce(app)
    } else {
      mainHandler.post { recoverLegacyMuteOnce(app) }
    }
  }

  /** User said Start recording. */
  fun playStartCue(context: Context) {
    val app = context.applicationContext
    mainHandler.post {
      recoverLegacyMuteOnce(app)
      vibrate(app, longArrayOf(0, 90, 60, 90))
      playTone(220)
    }
  }

  /** User said Stop recording. */
  fun playStopCue(context: Context) {
    val app = context.applicationContext
    mainHandler.post {
      recoverLegacyMuteOnce(app)
      vibrate(app, longArrayOf(0, 40, 50, 40))
    }
  }

  /**
   * Older builds left SYSTEM/NOTIFICATION at 0. Restore once, then never
   * touch stream volumes again.
   */
  private fun recoverLegacyMuteOnce(app: Context) {
    synchronized(lock) {
      if (recoveredLegacyMute) return
      recoveredLegacyMute = true
      try {
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getBoolean(PREFS_RECOVERED, false)) {
          prefs.edit().clear().apply()
          return
        }
        val am = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val recover = mutableListOf(
          AudioManager.STREAM_SYSTEM,
          AudioManager.STREAM_NOTIFICATION,
          AudioManager.STREAM_DTMF,
          AudioManager.STREAM_ALARM,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          recover.add(AudioManager.STREAM_ACCESSIBILITY)
        }
        val systemVol = am.getStreamVolume(AudioManager.STREAM_SYSTEM)
        val notifVol = am.getStreamVolume(AudioManager.STREAM_NOTIFICATION)
        if (systemVol == 0 && notifVol == 0) {
          for (stream in recover) {
            try {
              if (am.getStreamVolume(stream) == 0 && am.getStreamMaxVolume(stream) > 0) {
                am.setStreamVolume(
                  stream,
                  (am.getStreamMaxVolume(stream) * 2 / 3).coerceAtLeast(1),
                  0,
                )
              }
            } catch (_: Exception) {
              // ignore
            }
          }
        }
        prefs.edit().clear().putBoolean(PREFS_RECOVERED, true).apply()
      } catch (e: Exception) {
        Log.w(TAG, "recoverLegacyMute", e)
      }
    }
  }

  private fun vibrate(app: Context, timings: LongArray) {
    try {
      val v = vibrator(app) ?: return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        v.vibrate(VibrationEffect.createWaveform(timings, -1))
      } else {
        @Suppress("DEPRECATION")
        v.vibrate(timings, -1)
      }
    } catch (e: Exception) {
      Log.w(TAG, "vibrate", e)
    }
  }

  private fun playTone(durationMs: Int) {
    try {
      val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 85)
      tone.startTone(ToneGenerator.TONE_PROP_ACK, durationMs)
      mainHandler.postDelayed({
        try {
          tone.stopTone()
          tone.release()
        } catch (_: Exception) {
          // ignore
        }
      }, (durationMs + 60).toLong())
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
