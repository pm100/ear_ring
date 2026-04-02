package com.earring

object MusicTheory {

    val NOTE_NAMES: List<String> get() = (0..11).map { EarRingCore.noteName(it) }

    val SCALE_NAMES: List<String> get() = (0..3).map { EarRingCore.scaleName(it) }

    fun scaleLabel(rootChroma: Int, scaleId: Int): String = EarRingCore.scaleLabel(rootChroma, scaleId)

    fun midiToLabel(midi: Int): String = EarRingCore.midiToLabel(midi)

    fun midiPitchClass(midi: Int): Int = midi % 12

    fun isCorrect(detectedMidi: Int, cents: Int, expectedMidi: Int): Boolean =
        EarRingCore.isCorrectNote(detectedMidi, cents, expectedMidi)

    fun staffPosition(midi: Int): Int = EarRingCore.staffPosition(midi)
}

