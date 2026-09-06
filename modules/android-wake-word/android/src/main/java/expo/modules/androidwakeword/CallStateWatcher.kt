package expo.modules.androidwakeword

import android.content.Context
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager

/**
 * Detects incoming/outgoing cellular and VoIP calls without READ_PHONE_STATE.
 * The audio mode changes when the phone rings or a call is connected.
 */
class CallStateWatcher(private val context: Context) {
  private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val telephony = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
  private val mainHandler = Handler(Looper.getMainLooper())
  private var watching = false
  private var lastActive = false
  private var telephonyListening = false

  private val pollRunnable = object : Runnable {
    override fun run() {
      if (!watching) return
      publish()
      mainHandler.postDelayed(this, 300)
    }
  }

  @Suppress("DEPRECATION")
  private val phoneStateListener =
    object : PhoneStateListener() {
      @Deprecated("Deprecated in Java")
      override fun onCallStateChanged(state: Int, phoneNumber: String?) {
        publish()
      }
    }

  fun start() {
    if (watching) {
      publish()
      return
    }
    watching = true
    lastActive = false
    listenTelephony()
    mainHandler.post(pollRunnable)
    publish()
  }

  fun stop() {
    watching = false
    mainHandler.removeCallbacks(pollRunnable)
    unlistenTelephony()
    lastActive = false
  }

  fun isCallActive(): Boolean = isCallActiveNow()

  @Suppress("DEPRECATION")
  private fun listenTelephony() {
    if (telephonyListening) return
    try {
      telephony?.listen(phoneStateListener, PhoneStateListener.LISTEN_CALL_STATE)
      telephonyListening = true
    } catch (_: SecurityException) {
      telephonyListening = false
    } catch (_: Exception) {
      telephonyListening = false
    }
  }

  @Suppress("DEPRECATION")
  private fun unlistenTelephony() {
    if (!telephonyListening) return
    try {
      telephony?.listen(phoneStateListener, PhoneStateListener.LISTEN_NONE)
    } catch (_: Exception) {
      // ignore
    }
    telephonyListening = false
  }

  @Suppress("DEPRECATION")
  private fun isCallActiveNow(): Boolean {
    if (callActiveFromMode(audioManager.mode)) return true
    return try {
      val state = telephony?.callState ?: TelephonyManager.CALL_STATE_IDLE
      state == TelephonyManager.CALL_STATE_RINGING ||
        state == TelephonyManager.CALL_STATE_OFFHOOK
    } catch (_: Exception) {
      false
    }
  }

  private fun callActiveFromMode(mode: Int): Boolean =
    mode == AudioManager.MODE_IN_CALL ||
      mode == AudioManager.MODE_RINGTONE ||
      mode == AudioManager.MODE_IN_COMMUNICATION

  private fun publish() {
    val active = isCallActiveNow()
    if (active == lastActive) return
    lastActive = active
    AndroidWakeWordModule.emit(
      "onCallState",
      mapOf("active" to active),
    )
  }
}
