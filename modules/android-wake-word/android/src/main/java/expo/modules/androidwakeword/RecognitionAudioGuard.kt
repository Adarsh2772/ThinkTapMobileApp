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
 * Listening must never ring, beep, or vibrate.
 *
 * OEM SpeechRecognizer plays a start chime on each startListening(). Mute
 * SYSTEM/NOTIFICATION/RING with FLAG_REMOVE_SOUND_AND_VIBRATE for that
 * moment only — do not setStreamVolume (that haptic-spammed Vivo).
 *
 * [playStartCue] / [playStopCue] are the only app-owned cues, and only when
 * the user actually starts or stops a take.
 */
object RecognitionAudioGuard {
  private const val TAG = "ThinkTapAudioGuard"
  private val lock = Any()
  private val mainHandler = Handler(Looper.getMainLooper())
  @Volatile
  private var cueMuted = false

  fun muteRecognizerCue(context: Context) {
    val app = context.applicationContext
    val run = {
      synchronized(lock) {
        if (cueMuted) return@synchronized
        val am = app.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return@synchronized
        muteStreams(am)
        cueMuted = true
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) run() else mainHandler.post(run)
  }

  fun unmuteRecognizerCue(context: Context) {
    val app = context.applicationContext
    val run = {
      synchronized(lock) {
        if (!cueMuted) return@synchronized
        val am = app.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return@synchronized
        unmuteStreams(am)
        cueMuted = false
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) run() else mainHandler.post(run)
  }

  fun restore(context: Context) {
    unmuteRecognizerCue(context)
  }

  /** No-op kept for the JS module. Muting is handled by muteRecognizerCue. */
  fun swallowRecognizerCue(@Suppress("UNUSED_PARAMETER") context: Context) {}

  fun cancelRecognizerHaptic(@Suppress("UNUSED_PARAMETER") context: Context) {}

  /** User said Start recording. */
  fun playStartCue(context: Context) {
    val app = context.applicationContext
    mainHandler.post {
      unmuteRecognizerCue(app)
      vibrate(app, longArrayOf(0, 90, 60, 90))
      playTone(220)
    }
  }

  /** User said Stop recording. */
  fun playStopCue(context: Context) {
    val app = context.applicationContext
    mainHandler.post {
      unmuteRecognizerCue(app)
      vibrate(app, longArrayOf(0, 40, 50, 40))
    }
  }

  private fun muteStreams(am: AudioManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val flags = AudioManager.FLAG_REMOVE_SOUND_AND_VIBRATE
    for (stream in cueStreams()) {
      try {
        am.adjustStreamVolume(stream, AudioManager.ADJUST_MUTE, flags)
      } catch (_: Exception) {
        // ignore
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

  private fun cueStreams(): IntArray {
    return intArrayOf(
      AudioManager.STREAM_SYSTEM,
      AudioManager.STREAM_NOTIFICATION,
      AudioManager.STREAM_RING,
    )
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
