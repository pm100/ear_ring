package com.earring

/** Result of processing one audio frame through the pitch tracker. */
sealed class PitchFrame {
    /** No pitch detected or signal below silence threshold. */
    object Silence : PitchFrame()

    /**
     * A pitch is detected.
     * @param hz            Raw frequency (always > 0).
     * @param midi          MIDI note number for the detected frequency.
     * @param confirmedMidi Non-null only on the frame the note first stabilises;
     *                      null on subsequent frames while the same note is held.
     */
    data class Active(val hz: Float, val midi: Int, val confirmedMidi: Int?) : PitchFrame()
}
