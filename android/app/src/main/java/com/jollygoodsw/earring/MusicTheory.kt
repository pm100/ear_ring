package com.jollygoodsw.earring

object MusicTheory {

    val NOTE_NAMES: List<String> get() = (0..11).map { EarRingCore.noteName(it) }

    val SCALE_NAMES: List<String> get() = (0..4).map { EarRingCore.scaleName(it) }

    // Scale ids offered in the Scale picker. Locrian (id 4) stays supported by the
    // Rust core and SCALE_NAMES above, but is deliberately not offered as a choice yet.
    val SELECTABLE_SCALE_IDS: List<Int> = listOf(0, 1, 2, 3)

    fun scaleLabel(rootChroma: Int, scaleId: Int): String = EarRingCore.scaleLabel(rootChroma, scaleId)

    fun midiToLabel(midi: Int): String = EarRingCore.midiToLabel(midi)

    fun midiPitchClass(midi: Int): Int = midi % 12

    fun isCorrect(detectedMidi: Int, cents: Int, expectedMidi: Int): Boolean =
        EarRingCore.isCorrectNote(detectedMidi, cents, expectedMidi)

    fun staffPosition(midi: Int): Int = EarRingCore.staffPosition(midi)
}

