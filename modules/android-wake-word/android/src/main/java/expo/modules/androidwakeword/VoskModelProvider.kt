package expo.modules.androidwakeword

import android.content.Context
import android.util.Log
import org.vosk.Model
import java.io.File
import java.io.FileOutputStream
import kotlin.concurrent.thread

/**
 * Loads the Vosk speech model once and shares it.
 *
 * WHY a provider rather than loading in the service: the model is ~40 MB and
 * takes a second or two to initialise. Loading it per recording would add that
 * delay to every take. It is loaded once, off the main thread, and reused.
 *
 * The model ships inside the APK under `assets/vosk-model/` and is unpacked to
 * internal storage on first launch, because Vosk needs real file paths and
 * cannot read from the compressed asset bundle.
 *
 * Failure is never fatal. If the model is missing or corrupt, recording still
 * works and only voice commands are unavailable - the on-screen buttons cover
 * them. Losing a captured thought is the only unacceptable failure.
 */
object VoskModelProvider {
  private const val TAG = "ThinkTapVosk"
  private const val ASSET_DIR = "vosk-model"
  private const val TARGET_DIR = "vosk-model"
  /** Bump when the bundled model changes so the old copy is replaced. */
  private const val VERSION = 1

  @Volatile private var cached: Model? = null
  @Volatile private var loading = false
  private val waiters = mutableListOf<(Model?, String?) -> Unit>()

  fun loadAsync(context: Context, callback: (Model?, String?) -> Unit) {
    cached?.let { callback(it, null); return }

    synchronized(waiters) {
      waiters.add(callback)
      if (loading) return
      loading = true
    }

    val app = context.applicationContext
    thread(name = "VoskModelLoad", isDaemon = true) {
      var model: Model? = null
      var error: String? = null
      try {
        val dir = ensureUnpacked(app)
        model = Model(dir.absolutePath)
        cached = model
        Log.i(TAG, "model loaded from ${dir.absolutePath}")
      } catch (e: Throwable) {
        error = e.message ?: e.javaClass.simpleName
        Log.e(TAG, "model load failed", e)
      }
      val toNotify: List<(Model?, String?) -> Unit>
      synchronized(waiters) {
        loading = false
        toNotify = waiters.toList()
        waiters.clear()
      }
      toNotify.forEach { it(model, error) }
    }
  }

  fun isReady(): Boolean = cached != null

  /**
   * Copy the model out of assets on first run. A marker file records the
   * version so an app update with a new model replaces the old copy.
   */
  private fun ensureUnpacked(context: Context): File {
    val target = File(context.filesDir, TARGET_DIR)
    val marker = File(target, ".version")

    if (target.exists() && marker.exists()) {
      val existing = runCatching { marker.readText().trim().toInt() }.getOrNull()
      if (existing == VERSION) return target
      target.deleteRecursively()
    }

    target.mkdirs()
    copyAssetDir(context, ASSET_DIR, target)
    marker.writeText(VERSION.toString())
    Log.i(TAG, "model unpacked to ${target.absolutePath}")
    return target
  }

  private fun copyAssetDir(context: Context, assetPath: String, dest: File) {
    val names = context.assets.list(assetPath)
      ?: throw IllegalStateException("asset dir missing: $assetPath")

    if (names.isEmpty()) {
      // A leaf: assets.list() returns empty for files.
      dest.parentFile?.mkdirs()
      context.assets.open(assetPath).use { input ->
        FileOutputStream(dest).use { output -> input.copyTo(output) }
      }
      return
    }

    dest.mkdirs()
    for (name in names) {
      copyAssetDir(context, "$assetPath/$name", File(dest, name))
    }
  }
}
