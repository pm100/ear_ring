package com.jollygoodsw.earring

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaPlayer
import android.media.PlaybackParams
import android.media.audiofx.LoudnessEnhancer
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
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

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
            var enhancer: LoudnessEnhancer? = null
            val player = MediaPlayer().apply {
                setDataSource(file.absolutePath)
                prepare()
                playbackParams = PlaybackParams().setPitch(rate.coerceIn(0.5f, 2.0f))
                // The Salamander piano samples play back at whatever level they were
                // recorded/normalized at, with no headroom applied — reported as too quiet
                // by testers. MediaPlayer.setVolume() only attenuates (0.0-1.0, already at
                // its 1.0 default), so a real boost needs LoudnessEnhancer, which is built
                // for exactly this ("make quiet media louder without clipping" via dynamic
                // range compression, not naive linear gain). Attached per-note since each
                // note is its own MediaPlayer/session; a chord's simultaneous notes each get
                // the same boost independently, so the acoustic mix stays proportional. ~+6dB.
                enhancer = runCatching {
                    LoudnessEnhancer(audioSessionId).apply {
                        setTargetGain(600) // millibels = 6 dB
                        enabled = true
                    }
                }.getOrNull()
                setOnCompletionListener {
                    enhancer?.release()
                    it.release()
                    synchronized(activePlayers) { activePlayers.remove(it) }
                }
                setOnErrorListener { mp, _, _ ->
                    enhancer?.release()
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

    /**
     * Gradually fades out all currently-ringing notes over [durationMs], then stops and
     * releases them. Call this when playback phases end so piano sustain doesn't bleed
     * into the mic-listening phase.
     */
    fun fadeOutActive(durationMs: Long = 400L) {
        val targets = synchronized(activePlayers) { activePlayers.toList() }
        if (targets.isEmpty()) return
        scope.launch {
            val steps = 20
            val stepMs = (durationMs / steps).coerceAtLeast(10L)
            for (step in 1..steps) {
                val vol = 1f - step.toFloat() / steps
                withContext(Dispatchers.Main) {
                    targets.forEach { runCatching { it.setVolume(vol, vol) } }
                }
                delay(stepMs)
            }
            withContext(Dispatchers.Main) {
                targets.forEach { runCatching { it.stop(); it.release() } }
                synchronized(activePlayers) { activePlayers.removeAll(targets.toSet()) }
            }
        }
    }

    fun playSequence(
        midiNotes: List<Int>,
        bpm: Int = 100,
        durations: List<Float>? = null,
        onEach: (Int) -> Unit = {},
        onDone: () -> Unit = {}
    ) {
        // Cancel any pending sequencing loop but let currently-ringing notes decay
        // naturally — calling cancelPlayback() here would cut them off mid-sustain.
        sequenceJob?.cancel()
        sequenceJob = null
        sequenceJob = scope.launch {
            for ((index, midi) in midiNotes.withIndex()) {
                if (!isActive) break
                val stepMs = ((60_000.0 / bpm.coerceAtLeast(1)) * (durations?.getOrNull(index) ?: 1.0f)).toLong().coerceAtLeast(150L)
                withContext(Dispatchers.Main) { onEach(index) }
                val nearestMidi = nearestSampleMidi(midi)
                val sampleFile = getCachedSample(nearestMidi)
                if (sampleFile != null) {
                    val rate = pitchRate(midi, nearestMidi)
                    withContext(Dispatchers.Main) { playFile(sampleFile, rate) }
                }
                delay(stepMs)
            }
            if (isActive) {
                withContext(Dispatchers.Main) { onDone() }
            }
        }
    }

    // ── Pass/fail feedback tones ──────────────────────────────────────────────
    // Plain synthesized sine tones (not the sampled piano) so they play instantly with
    // no network/sample-load dependency. notes: (midi, startMs, durationMs) triples.

    private val chimeSampleRate = 44100

    private fun synthesizeChime(notes: List<Triple<Int, Long, Long>>): ShortArray {
        val totalMs = notes.maxOf { (_, startMs, durMs) -> startMs + durMs } + 20
        val totalSamples = (chimeSampleRate * totalMs / 1000).toInt()
        val buffer = ShortArray(totalSamples)
        for ((midi, startMs, durMs) in notes) {
            val freq = 440.0 * 2.0.pow((midi - 69) / 12.0)
            val startSample = (chimeSampleRate * startMs / 1000).toInt()
            val numSamples = (chimeSampleRate * durMs / 1000).toInt()
            val fadeSamples = min(numSamples / 3, chimeSampleRate * 15 / 1000)
            for (i in 0 until numSamples) {
                val idx = startSample + i
                if (idx >= buffer.size) break
                // Quick linear fade in/out avoids the click a hard on/off edge would cause.
                val envelope = when {
                    i < fadeSamples -> i.toFloat() / fadeSamples
                    i > numSamples - fadeSamples -> (numSamples - i).toFloat() / fadeSamples
                    else -> 1f
                }
                val sample = sin(2.0 * PI * freq * i / chimeSampleRate) * envelope * 0.3
                val mixed = buffer[idx] + (sample * Short.MAX_VALUE).toInt()
                buffer[idx] = mixed.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
            }
        }
        return buffer
    }

    private fun playPcm(samples: ShortArray) {
        val track = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            .setAudioFormat(
                AudioFormat.Builder()
                    .setSampleRate(chimeSampleRate)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build()
            )
            .setBufferSizeInBytes(samples.size * 2)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        try {
            track.write(samples, 0, samples.size)
            track.play()
        } catch (e: Exception) {
            Log.e("AudioPlayback", "Error playing chime: ${e.message}")
            track.release()
            return
        }
        scope.launch {
            delay(samples.size * 1000L / chimeSampleRate + 50L)
            track.release()
        }
    }

    /** Bright ascending major arpeggio (C6 E6 G6) — a test passed. */
    fun playPassSound() {
        playPcm(synthesizeChime(listOf(
            Triple(84, 0L, 110L),
            Triple(88, 90L, 110L),
            Triple(91, 180L, 160L),
        )))
    }

    /** Soft descending major third (A4 F4) — a test failed. Lower register and a falling
     *  contour make it easy to tell apart from the pass chime by ear alone. */
    fun playFailSound() {
        playPcm(synthesizeChime(listOf(
            Triple(69, 0L, 140L),
            Triple(65, 120L, 220L),
        )))
    }

    fun playChord(
        midiNotes: List<Int>,
        holdMs: Long = 600L,
        onDone: () -> Unit = {}
    ) {
        // Cancel any pending sequencing loop but let currently-ringing notes decay
        // naturally — calling cancelPlayback() here would cut them off mid-sustain.
        sequenceJob?.cancel()
        sequenceJob = null
        sequenceJob = scope.launch {
            val playable = midiNotes.mapNotNull { midi ->
                val nearestMidi = nearestSampleMidi(midi)
                val sampleFile = getCachedSample(nearestMidi) ?: return@mapNotNull null
                sampleFile to pitchRate(midi, nearestMidi)
            }
            withContext(Dispatchers.Main) {
                playable.forEach { (file, rate) -> playFile(file, rate) }
            }
            delay(holdMs)
            if (isActive) {
                withContext(Dispatchers.Main) { onDone() }
            }
        }
    }
}
