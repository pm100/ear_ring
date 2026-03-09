package com.earring

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Base64
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * AudioCaptureModule — streams real-time PCM audio from the microphone to JS.
 *
 * JS usage:
 *   const { NativeModules, NativeEventEmitter } = require('react-native');
 *   const emitter = new NativeEventEmitter(NativeModules.AudioCapture);
 *   emitter.addListener('onAudioData', ({ data, sampleRate, count }) => { ... });
 *   await NativeModules.AudioCapture.startRecording(44100, 4096);
 *   await NativeModules.AudioCapture.stopRecording();
 *
 * 'data' is a base64-encoded little-endian Float32 array of length 'count'.
 */
@ReactModule(name = AudioCaptureModule.NAME)
class AudioCaptureModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "AudioCapture"
        const val EVENT_AUDIO_DATA = "onAudioData"
    }

    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    @Volatile private var isRecording = false

    override fun getName() = NAME

    private fun sendEvent(params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_AUDIO_DATA, params)
    }

    @ReactMethod
    fun startRecording(sampleRate: Int, bufferSize: Int, promise: Promise) {
        if (isRecording) {
            promise.reject("ALREADY_RECORDING", "Already recording")
            return
        }

        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        if (minBuf == AudioRecord.ERROR_BAD_VALUE || minBuf == AudioRecord.ERROR) {
            promise.reject("INIT_ERROR", "AudioRecord.getMinBufferSize failed")
            return
        }

        val byteBufSize = maxOf(minBuf, bufferSize * 2) // 2 bytes per sample (16-bit)

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                byteBufSize
            )
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", "AudioRecord constructor failed: ${e.message}")
            return
        }

        if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
            audioRecord?.release()
            audioRecord = null
            promise.reject("INIT_ERROR", "AudioRecord failed to initialize (check RECORD_AUDIO permission)")
            return
        }

        isRecording = true
        audioRecord?.startRecording()

        val shortBuf = ShortArray(bufferSize)
        val floatBuf = FloatArray(bufferSize)
        val byteBuffer = ByteBuffer.allocate(bufferSize * 4).order(ByteOrder.LITTLE_ENDIAN)

        recordingThread = Thread {
            while (isRecording) {
                val read = audioRecord?.read(shortBuf, 0, bufferSize) ?: 0
                if (read > 0) {
                    // Convert 16-bit PCM to float32 [-1.0, 1.0]
                    for (i in 0 until read) {
                        floatBuf[i] = shortBuf[i] / 32768.0f
                    }
                    // Pack as little-endian float32 bytes and base64-encode
                    byteBuffer.clear()
                    for (i in 0 until read) byteBuffer.putFloat(floatBuf[i])
                    val b64 = Base64.encodeToString(byteBuffer.array(), 0, read * 4, Base64.NO_WRAP)

                    val params = Arguments.createMap()
                    params.putString("data", b64)
                    params.putInt("sampleRate", sampleRate)
                    params.putInt("count", read)
                    sendEvent(params)
                }
            }
        }.apply {
            name = "AudioCaptureThread"
            start()
        }

        promise.resolve(null)
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        isRecording = false
        recordingThread?.join(2000)
        recordingThread = null
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (_: Exception) {}
        audioRecord = null
        promise.resolve(null)
    }

    // Required by NativeEventEmitter on the JS side
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
