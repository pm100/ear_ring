package com.earring

object MusicTheory {

    val NOTE_NAMES = listOf("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")

    val SCALE_NAMES = listOf(
        "Major", "Natural Minor", "Harmonic Minor", "Pentatonic Major",
        "Pentatonic Minor", "Dorian", "Mixolydian", "Blues"
    )

    val SCALE_INTERVALS = mapOf(
        0 to listOf(0, 2, 4, 5, 7, 9, 11),
        1 to listOf(0, 2, 3, 5, 7, 8, 10),
        2 to listOf(0, 2, 3, 5, 7, 8, 11),
        3 to listOf(0, 2, 4, 7, 9),
        4 to listOf(0, 3, 5, 7, 10),
        5 to listOf(0, 2, 3, 5, 7, 9, 10),
        6 to listOf(0, 2, 4, 5, 7, 9, 10),
        7 to listOf(0, 3, 5, 6, 7, 10)
    )

    fun midiToLabel(midi: Int): String {
        val pitchClass = midi % 12
        val octave = midi / 12 - 1
        return "${NOTE_NAMES[pitchClass]}$octave"
    }

    fun midiPitchClass(midi: Int): Int = midi % 12

    fun isCorrect(detectedMidi: Int, cents: Int, expectedMidi: Int): Boolean {
        return detectedMidi % 12 == expectedMidi % 12 && kotlin.math.abs(cents) <= 50
    }

    fun staffPosition(midi: Int): Int = EarRingCore.staffPosition(midi)

    /** Returns the chromatic scale degree (0-11) of the root for key-sig sharps/flats display. */
    fun keyAccidentals(rootPitchClass: Int, scaleId: Int): List<Int> {
        val intervals = SCALE_INTERVALS[scaleId] ?: return emptyList()
        return intervals.map { (rootPitchClass + it) % 12 }.filter { NOTE_NAMES[it].contains("#") }
    }
}
