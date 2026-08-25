package com.jollygoodsw.earring

/** Result of processing one audio frame through the pitch tracker. */
sealed class PitchFrame {
    /** No pitch detected or signal below silence threshold. */
    object Silence : PitchFrame()

    /**
     * A pitch is detected.
     * @param hz            Raw frequency (always > 0).
     * @param midi          MIDI note number for the detected frequency, straight from
     *                      pitch detection with no debouncing — a single frame here can
     *                      be a transient detection glitch (e.g. an octave error), most
     *                      common on higher notes. Prefer [displayMidi] for UI display.
     * @param displayMidi   Same note as [midi], but only once it has held for 2
     *                      consecutive frames. Never lags behind [confirmedMidi]. -1 if
     *                      not yet debounced.
     * @param confirmedMidi Non-null only on the frame the note first stabilises;
     *                      null on subsequent frames while the same note is held.
     */
    data class Active(val hz: Float, val midi: Int, val displayMidi: Int, val confirmedMidi: Int?) : PitchFrame()
}
