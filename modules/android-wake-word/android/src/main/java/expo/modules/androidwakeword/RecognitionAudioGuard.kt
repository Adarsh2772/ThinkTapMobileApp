package expo.modules.androidwakeword

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.util.SparseIntArray
import kotlin.math.max

/**
 * Suppress OEM SpeechRecognizer start chimes on every Android version we ship
 * (minSdk 24 through Android 15+). Same product behavior on all API levels —
 * no version forks for mute / beep policy.
 *
 * - [muteRecognizerCue] / [unmuteRecognizerCue]: idempotent apply/clear for FGS.
 * - [holdCaptureMute] / [releaseCaptureMute]: refcount so a take stays silent
 *   even if FGS briefly unmutes between recognition sessions.
 * - Prefer ADJUST_MUTE; if a stream is still audible, set volume=0 once and
 *   restore later (never spam ADJUST_LOWER — that haptic-spammed some Vivos).
 *
 * Start/stop cues vibrate only — never play a tone.
 */
object RecognitionAudioGuard {
  private const val TAG = "ThinkTapAudioGuard"
  private val lock = Any()
  private val mainHandler = Handler(Looper.getMainLooper())

  @Volatile
  private var cueMuted = false

  @Volatile
  private var captureHold = 0

  /** Stream volumes saved before volume-0 fallback; restored on full release. */
  private val savedVolumes = SparseIntArray()

  fun muteRecognizerCue(context: Context) {
    val app = context.applicationContext
    val run = {
      synchronized(lock) {
        applyMute(app)
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) run() else mainHandler.post(run)
  }

  fun unmuteRecognizerCue(context: Context) {
    val app = context.applicationContext
    val run = {
      synchronized(lock) {
        // A recording take owns silence until releaseCaptureMute.
        if (captureHold > 0) {
          applyMute(app)
          return@synchronized
        }
        applyUnmute(app)
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) run() else mainHandler.post(run)
  }

  fun restore(context: Context) {
    val app = context.applicationContext
    val run = {
      synchronized(lock) {
        captureHold = 0
        applyUnmute(app)
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) run() else mainHandler.post(run)
  }

  /** JS: mute OEM SpeechRecognizer start chimes. */
  fun swallowRecognizerCue(context: Context) {
    muteRecognizerCue(context)
  }

  /** Hold mute for an entire recording take (refcount). */
  fun holdCaptureMute(context: Context) {
    val app = context.applicationContext
    val run = {
      synchronized(lock) {
        captureHold += 1
        applyMute(app)
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) run() else mainHandler.post(run)
  }

  fun releaseCaptureMute(context: Context) {
    val app = context.applicationContext
    val run = {
      synchronized(lock) {
        captureHold = max(0, captureHold - 1)
        if (captureHold == 0) {
          applyUnmute(app)
        } else {
          applyMute(app)
        }
      }
    }
    if (Looper.myLooper() == Looper.getMainLooper()) run() else mainHandler.post(run)
  }

  fun cancelRecognizerHaptic(@Suppress("UNUSED_PARAMETER") context: Context) {}

  fun playStartCue(context: Context) {
    val app = context.applicationContext
    mainHandler.post {
      muteRecognizerCue(app)
      vibrate(app, longArrayOf(0, 90, 60, 90))
    }
  }

  fun playStopCue(context: Context) {
    val app = context.applicationContext
    mainHandler.post {
      muteRecognizerCue(app)
      vibrate(app, longArrayOf(0, 40, 50, 40))
    }
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
    val flags = AudioManager.FLAG_REMOVE_SOUND_AND_VIBRATE
    for (stream in cueStreams()) {
      try {
        am.adjustStreamVolume(stream, AudioManager.ADJUST_UNMUTE, flags)
      } catch (_: Exception) {
        // ignore
      }
    }
  }

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
        if (!muted && volume > 0) {
          if (savedVolumes.indexOfKey(stream) < 0) {
            savedVolumes.put(stream, volume)
          }
          am.setStreamVolume(stream, 0, 0)
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
    return intArrayOf(
      AudioManager.STREAM_SYSTEM,
      AudioManager.STREAM_NOTIFICATION,
      AudioManager.STREAM_MUSIC,
      AudioManager.STREAM_ALARM,
      AudioManager.STREAM_RING,
      AudioManager.STREAM_DTMF,
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

  private fun vibrator(context: Context): Vibrator? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
  }
}
