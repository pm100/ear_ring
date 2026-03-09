package com.earring

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class AudioCapture {

    private var audioRecord: AudioRecord? = null
    private var captureJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    fun start(
        sampleRate: Int = 44100,
        bufferSize: Int = 4096,
        onAudio: (FloatArray) -> Unit
    ) {
        stop()

        val minBuffer = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val actualBuffer = maxOf(bufferSize * 2, minBuffer)

        try {
            val record = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                actualBuffer
            )
            if (record.state != AudioRecord.STATE_INITIALIZED) {
                Log.e("AudioCapture", "AudioRecord failed to initialize")
                record.release()
                return
            }
            audioRecord = record
            record.startRecording()

            captureJob = scope.launch {
                val shortBuffer = ShortArray(bufferSize)
                val floatBuffer = FloatArray(bufferSize)
                while (isActive) {
                    val read = record.read(shortBuffer, 0, bufferSize)
                    if (read > 0) {
                        for (i in 0 until read) {
                            floatBuffer[i] = shortBuffer[i] / 32768f
                        }
                        onAudio(floatBuffer.copyOf(read))
                    }
                }
            }
        } catch (e: SecurityException) {
            Log.e("AudioCapture", "Permission denied: ${e.message}")
        } catch (e: Exception) {
            Log.e("AudioCapture", "Error starting capture: ${e.message}")
        }
    }

    fun stop() {
        captureJob?.cancel()
        captureJob = null
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {
            Log.e("AudioCapture", "Error stopping: ${e.message}")
        }
        audioRecord = null
    }
}
