package expo.modules.androidwakeword

/**
 * Recognises the four spoken commands from Vosk transcript text.
 *
 * WHY pattern matching and not a literal phrase list: the previous build kept a
 * hardcoded list of spellings ("hey think tap", "hey thinktap", ...). A speech
 * engine never returns a brand name the same way twice. Real output captured
 * from a device in a single session:
 *
 *   "think that"            "thinking tab start"     "hitting tap start"
 *   "I think that start"    "think I have start"     "hey think app"
 *
 * Only the last one was in the list, so "hey think tap start" usually did
 * nothing. Matching the SHAPE of the name covers all of them and anything else
 * the engine invents.
 */
object CommandMatcher {

  enum class Command { NONE, WAKE, PAUSE, RESUME, STOP }

  /**
   * TIGHT: unambiguous renderings of the brand name. Safe to fire on their own.
   */
  private val NAME_TIGHT = Regex("\\bthink\\s?(tap|tapp|tabs?)\\b")

  /**
   * LOOSE: how the engine mangles it in practice - "think that", "thing tap",
   * "hitting tab". Each of these contains ordinary English words, so they only
   * count when preceded by a wake prefix.
   *
   * WHY: without that guard, real captured output like "so i think that" and
   * "and let us see how is it was hitting that" fired a wake. The name has to
   * be addressed, not merely mentioned.
   */
  private val NAME_LOOSE = Regex(
    "\\b(think|thin|thing|sink|tink|hitting|thinking)\\s?" +
      "(tap|tab|top|app|cap|that|taps|tabs)\\b"
  )

  private val WAKE_PREFIX = Regex("\\b(hey|hi|ok|okay)\\s+")

  /**
   * A command is a short utterance. Anything longer is someone talking about
   * the product, not to it.
   */
  private const val MAX_COMMAND_WORDS = 6

  private val START_ONLY = Regex("\\b(start|begin|new)\\s+(recording|record|note|idea)\\b")
  private val STOP_ONLY = Regex("\\b(stop|end|finish)\\s+(the\\s+)?(recording|record)\\b")
  private val PAUSE_ONLY = Regex("\\b(pause|hold)\\s+(the\\s+)?(recording|record)\\b")
  private val RESUME_ONLY = Regex("\\b(resume|continue)\\s+(the\\s+)?(recording|record)\\b")

  private val TRAILING_START = Regex("\\b(start|begin|go)\\b\\s*$")
  private val TRAILING_STOP = Regex("\\b(stop|end|finish|done)\\b\\s*$")
  private val TRAILING_PAUSE = Regex("\\b(pause|hold|wait)\\b\\s*$")
  private val TRAILING_RESUME = Regex("\\b(resume|continue)\\b\\s*$")

  private val BARE_STOP = setOf(
    "stop", "please stop", "stop it", "that is all", "thats all",
    "im done", "i m done", "i am done",
  )

  fun normalize(text: String): String =
    text.lowercase()
      .replace(Regex("[^a-z0-9\\s]"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()

  private fun hasName(n: String): Boolean {
    if (NAME_TIGHT.containsMatchIn(n)) return true
    // Loose spellings need the name to be addressed, not just mentioned.
    return WAKE_PREFIX.containsMatchIn(n) && NAME_LOOSE.containsMatchIn(n)
  }

  private fun isShort(n: String): Boolean =
    n.split(" ").size <= MAX_COMMAND_WORDS

  /**
   * Resolve an utterance to at most one command.
   *
   * Order matters. "hey thinktap stop" contains the name, so a naive wake check
   * matches it first and re-starts a take instead of ending it - that is the
   * exact bug the previous build had. Specific commands are therefore tested
   * before the bare wake phrase.
   */
  fun match(raw: String, isRecording: Boolean, isPaused: Boolean): Command {
    val n = normalize(raw)
    if (n.isEmpty()) return Command.NONE

    // ---- Commands that only make sense during a take ----
    if (isRecording) {
      /**
       * WHY the name is mandatory here: while recording, the user is speaking
       * continuously and every sentence is scored against the command list. A
       * bare "stop" or "end recording" was matched from ordinary dictation and
       * ended a real take the user never meant to end. Requiring the name means
       * the command has to be addressed to the app.
       */
      if (!hasName(n)) return Command.NONE
      if (!isShort(n)) return Command.NONE

      if (TRAILING_STOP.containsMatchIn(n)) return Command.STOP
      if (isPaused) {
        if (TRAILING_RESUME.containsMatchIn(n)) return Command.RESUME
      } else {
        if (TRAILING_PAUSE.containsMatchIn(n)) return Command.PAUSE
      }
      return Command.NONE
    }

    // ---- Idle: only a wake / start can fire ----
    if (STOP_ONLY.containsMatchIn(n)) return Command.NONE
    if (PAUSE_ONLY.containsMatchIn(n)) return Command.NONE
    if (START_ONLY.containsMatchIn(n)) return Command.WAKE
    // WHY the length guard: "and let us see how is it was hitting that" should
    // never start a recording. A wake phrase is spoken, not narrated.
    if (!isShort(n)) return Command.NONE
    if (hasName(n) && TRAILING_START.containsMatchIn(n)) return Command.WAKE
    if (hasName(n)) return Command.WAKE
    return Command.NONE
  }
}
