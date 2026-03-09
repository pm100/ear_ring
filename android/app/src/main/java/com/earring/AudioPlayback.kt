package com.earring

import android.content.Context
import android.media.MediaPlayer
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import kotlin.math.pow
import kotlin.math.roundToInt

class AudioPlayback(private val context: Context) {

    private val scope = CoroutineScope(Dispatchers.IO)
    private var sequenceJob: Job? = null
    private val activePlayers = mutableListOf<MediaPlayer>()

    // Available piano sample notes as MIDI values
    // A0=21, C1=24, Ds1=27, Fs1=30, A1=33, C2=36, Ds2=39, Fs2=42, A2=45,
    // C3=48, Ds3=51, Fs3=54, A3=57, C4=60, Ds4=63, Fs4=66, A4=69, C5=72,
    // Ds5=75, Fs5=78, A5=81, C6=84, Ds6=87, Fs6=90, A6=93, C7=96, Ds7=99, Fs7=102, A7=105, C8=108
    private val sampleMidiNotes = listOf(
        21, 24, 27, 30, 33, 36, 39, 42, 45,
        48, 51, 54, 57, 60, 63, 66, 69, 72,
        75, 78, 81, 84, 87, 90, 93, 96, 99, 102, 105, 108
    )

    private val sampleNames = mapOf(
        21 to "A0", 24 to "C1", 27 to "Ds1", 30 to "Fs1", 33 to "A1",
        36 to "C2", 39 to "Ds2", 42 to "Fs2", 45 to "A2",
        48 to "C3", 51 to "Ds3", 54 to "Fs3", 57 to "A3",
        60 to "C4", 63 to "Ds4", 66 to "Fs4", 69 to "A4",
        72 to "C5", 75 to "Ds5", 78 to "Fs5", 81 to "A5",
        84 to "C6", 87 to "Ds6", 90 to "Fs6", 93 to "A6",
        96 to "C7", 99 to "Ds7", 102 to "Fs7", 105 to "A7", 108 to "C8"
    )

    private val BASE_URL = "https://tonejs.github.io/audio/salamander/"
    private val cacheDir = File(context.cacheDir, "piano_samples").also { it.mkdirs() }

    private fun nearestSampleMidi(midi: Int): Int {
        return sampleMidiNotes.minByOrNull { kotlin.math.abs(it - midi) } ?: 60
    }

    private fun pitchRate(requestedMidi: Int, sampleMidi: Int): Float {
        val delta = requestedMidi - sampleMidi
        return 2f.pow(delta / 12f)
    }

    private suspend fun getCachedSample(midi: Int): File? = withContext(Dispatchers.IO) {
        val name = sampleNames[midi] ?: return@withContext null
        val file = File(cacheDir, "$name.mp3")
        if (file.exists() && file.length() > 0) return@withContext file
        try {
            val url = URL("$BASE_URL${name}.mp3")
            val connection = url.openConnection().apply {
                connectTimeout = 10_000
                readTimeout = 30_000
            }
            connection.getInputStream().use { input ->
                FileOutputStream(file).use { output ->
                    input.copyTo(output)
                }
            }
            file
        } catch (e: Exception) {
            Log.e("AudioPlayback", "Failed to download $name: ${e.message}")
            file.delete()
            null
        }
    }

    fun playNote(midi: Int) {
        scope.launch {
            val nearestMidi = nearestSampleMidi(midi)
            val sampleFile = getCachedSample(nearestMidi) ?: return@launch
            val rate = pitchRate(midi, nearestMidi)
            withContext(Dispatchers.Main) {
                playFile(sampleFile, rate)
            }
        }
    }

    private fun playFile(file: File, rate: Float) {
        try {
            val player = MediaPlayer().apply {
                setDataSource(file.absolutePath)
                prepare()
                playbackParams = playbackParams.setSpeed(rate.coerceIn(0.5f, 2.0f))
                setOnCompletionListener {
                    it.release()
                    synchronized(activePlayers) { activePlayers.remove(it) }
                }
                setOnErrorListener { mp, _, _ ->
                    mp.release()
                    synchronized(activePlayers) { activePlayers.remove(mp) }
                    false
                }
            }
            synchronized(activePlayers) { activePlayers.add(player) }
            player.start()
        } catch (e: Exception) {
            Log.e("AudioPlayback", "Error playing file: ${e.message}")
        }
    }

    fun cancelPlayback() {
        sequenceJob?.cancel()
        sequenceJob = null
        synchronized(activePlayers) {
            activePlayers.forEach { runCatching { it.stop(); it.release() } }
            activePlayers.clear()
        }
    }

    fun playSequence(
        midiNotes: List<Int>,
        onEach: (Int) -> Unit = {},
        onDone: () -> Unit = {}
    ) {
        cancelPlayback()
        sequenceJob = scope.launch {
            for ((index, midi) in midiNotes.withIndex()) {
                if (!isActive) break
                withContext(Dispatchers.Main) { onEach(index) }
                val nearestMidi = nearestSampleMidi(midi)
                val sampleFile = getCachedSample(nearestMidi)
                if (sampleFile != null) {
                    val rate = pitchRate(midi, nearestMidi)
                    withContext(Dispatchers.Main) { playFile(sampleFile, rate) }
                }
                delay(600)
            }
            if (isActive) {
                withContext(Dispatchers.Main) { onDone() }
            }
        }
    }
}
