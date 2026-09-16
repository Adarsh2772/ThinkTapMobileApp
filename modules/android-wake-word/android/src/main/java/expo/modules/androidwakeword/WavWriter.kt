package expo.modules.androidwakeword

import android.util.Log
import java.io.File
import java.io.RandomAccessFile

/**
 * Writes 16-bit PCM frames to a WAV file.
 *
 * WHY this exists: the old build had no single owner of the audio stream.
 * expo-audio opened its own microphone session while SpeechRecognizer opened
 * another, and Android only grants one - so either the recording or the voice
 * commands failed, differently on every device.
 *
 * Now [AudioCaptureService] owns the one and only AudioRecord and hands the
 * same frames to this writer and to the command recogniser. Nothing competes
 * for the microphone, so behaviour is identical on every Android version.
 *
 * Pause/resume is a property of this writer, not of the microphone: the capture
 * loop keeps running (so commands stay audible while paused) and this class
 * simply stops appending frames.
 */
class WavWriter(
  private val file: File,
  private val sampleRate: Int,
  private val channels: Int = 1,
  private val bitsPerSample: Int = 16,
) {
  companion object {
    private const val TAG = "ThinkTapWav"
    private const val HEADER_BYTES = 44
  }

  private var raf: RandomAccessFile? = null
  private var dataBytes = 0L

  @Volatile
  var isPaused: Boolean = false
    private set

  val path: String get() = file.absolutePath

  /** Milliseconds of audio actually written (excludes paused time). */
  val durationMs: Long
    get() {
      val bytesPerMs = (sampleRate * channels * bitsPerSample / 8) / 1000.0
      if (bytesPerMs <= 0) return 0
      return (dataBytes / bytesPerMs).toLong()
    }

  fun open() {
    file.parentFile?.mkdirs()
    if (file.exists()) file.delete()
    val f = RandomAccessFile(file, "rw")
    // Reserve the header; sizes are patched in close().
    f.write(ByteArray(HEADER_BYTES))
    raf = f
    dataBytes = 0
    isPaused = false
  }

  fun pause() {
    isPaused = true
  }

  fun resume() {
    isPaused = false
  }

  /**
   * Append PCM frames. Called from the capture thread only.
   * Returns false if the writer is closed or paused (frame discarded).
   */
  fun write(buffer: ShortArray, readSize: Int): Boolean {
    val f = raf ?: return false
    if (isPaused || readSize <= 0) return false
    return try {
      val bytes = ByteArray(readSize * 2)
      var j = 0
      for (i in 0 until readSize) {
        val s = buffer[i].toInt()
        bytes[j++] = (s and 0xFF).toByte()          // little-endian
        bytes[j++] = ((s shr 8) and 0xFF).toByte()
      }
      f.write(bytes)
      dataBytes += bytes.size
      true
    } catch (e: Exception) {
      Log.e(TAG, "write failed", e)
      false
    }
  }

  /**
   * Drop the last [ms] milliseconds of audio.
   *
   * WHY this exists: a take stopped by voice contains the spoken command at the
   * end - "hey think tap stop" was audible in playback and appeared in the
   * transcript. Rewinding the file before closing removes it.
   *
   * Safe on a short take: never trims below zero.
   */
  fun trimTail(ms: Long) {
    val f = raf ?: return
    val bytesPerMs = (sampleRate * channels * bitsPerSample / 8) / 1000.0
    val drop = (ms * bytesPerMs).toLong()
    if (drop <= 0 || drop >= dataBytes) return
    try {
      dataBytes -= drop
      f.setLength(HEADER_BYTES + dataBytes)
      f.seek(HEADER_BYTES + dataBytes)
    } catch (e: Exception) {
      Log.w(TAG, "trimTail failed", e)
    }
  }

  /** Patch the RIFF header with the real sizes and close. Returns the path. */
  fun close(): String? {
    val f = raf ?: return null
    raf = null
    return try {
      f.seek(0)
      f.write(buildHeader(dataBytes))
      f.close()
      file.absolutePath
    } catch (e: Exception) {
      Log.e(TAG, "close failed", e)
      try { f.close() } catch (_: Exception) {}
      null
    }
  }

  fun discard() {
    try { raf?.close() } catch (_: Exception) {}
    raf = null
    try { if (file.exists()) file.delete() } catch (_: Exception) {}
    dataBytes = 0
  }

  private fun buildHeader(dataLen: Long): ByteArray {
    val byteRate = sampleRate * channels * bitsPerSample / 8
    val blockAlign = channels * bitsPerSample / 8
    val riffLen = dataLen + HEADER_BYTES - 8
    val h = ByteArray(HEADER_BYTES)

    fun putStr(offset: Int, s: String) {
      for (i in s.indices) h[offset + i] = s[i].code.toByte()
    }
    fun putInt(offset: Int, v: Long) {
      h[offset] = (v and 0xFF).toByte()
      h[offset + 1] = ((v shr 8) and 0xFF).toByte()
      h[offset + 2] = ((v shr 16) and 0xFF).toByte()
      h[offset + 3] = ((v shr 24) and 0xFF).toByte()
    }
    fun putShort(offset: Int, v: Int) {
      h[offset] = (v and 0xFF).toByte()
      h[offset + 1] = ((v shr 8) and 0xFF).toByte()
    }

    putStr(0, "RIFF")
    putInt(4, riffLen)
    putStr(8, "WAVE")
    putStr(12, "fmt ")
    putInt(16, 16)                 // PCM chunk size
    putShort(20, 1)                // PCM format
    putShort(22, channels)
    putInt(24, sampleRate.toLong())
    putInt(28, byteRate.toLong())
    putShort(32, blockAlign)
    putShort(34, bitsPerSample)
    putStr(36, "data")
    putInt(40, dataLen)
    return h
  }
}
