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
 * Keeps Android SpeechRecognizer start chimes/haptics silent while listening,
 * and plays a single ring + vibrate when the user actually starts recording.
 */
object RecognitionAudioGuard {
  private const val TAG = "ThinkTapAudioGuard"
  private val lock = Any()
  private val savedVolumes = mutableMapOf<Int, Int>()
  @Volatile
  private var muted = false

  private fun beepStreams(): IntArray {
    val list = mutableListOf(
      AudioManager.STREAM_SYSTEM,
      AudioManager.STREAM_NOTIFICATION,
      AudioManager.STREAM_DTMF,
      AudioManager.STREAM_ALARM,
    )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      list.add(AudioManager.STREAM_ACCESSIBILITY)
    }
    return list.toIntArray()
  }

  fun mute(context: Context) {
    synchronized(lock) {
      try {
        val app = context.applicationContext
        val am = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        cancelVibrator(app)
        if (!muted) {
          savedVolumes.clear()
          for (stream in beepStreams()) {
            savedVolumes[stream] = am.getStreamVolume(stream)
          }
          muted = true
        }
        for (stream in beepStreams()) {
          try {
            am.setStreamVolume(stream, 0, AudioManager.FLAG_REMOVE_SOUND_AND_VIBRATE)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
              am.adjustStreamVolume(
                stream,
                AudioManager.ADJUST_MUTE,
                AudioManager.FLAG_REMOVE_SOUND_AND_VIBRATE,
              )
            }
          } catch (_: Exception) {
            // Some OEMs block individual streams.
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "mute", e)
      }
    }
  }

  fun restore(context: Context) {
    synchronized(lock) {
      if (!muted) return
      try {
        val am = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        for ((stream, volume) in savedVolumes) {
          try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
              am.adjustStreamVolume(stream, AudioManager.ADJUST_UNMUTE, 0)
            }
            am.setStreamVolume(stream, volume, 0)
          } catch (_: Exception) {
            // ignore
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "restore", e)
      }
      savedVolumes.clear()
      muted = false
    }
  }

  fun playStartCue(context: Context) {
    val app = context.applicationContext
    restore(app)
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
      Handler(Looper.getMainLooper()).postDelayed({
        try {
          tone.stopTone()
          tone.release()
        } catch (_: Exception) {
          // ignore
        }
        mute(app)
      }, 280)
    } catch (e: Exception) {
      Log.w(TAG, "tone", e)
      mute(app)
    }
  }

  fun cancelVibrator(context: Context) {
    try {
      vibrator(context)?.cancel()
    } catch (_: Exception) {
      // ignore
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
