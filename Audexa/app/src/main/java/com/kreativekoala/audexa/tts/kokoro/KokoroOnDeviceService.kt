package com.kreativekoala.audexa.tts.kokoro

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer

/**
 * Kokoro 82M TTS running locally via ONNX Runtime.
 *
 * Architecture (mirrors the kokoro-onnx Python reference):
 * 1. Text → phonemes via [KokoroG2P] (CMUdict + LTS, ARPAbet → IPA-ish).
 * 2. Phonemes → token IDs via the vocab map bundled with the model.
 * 3. Run the ONNX model with three inputs:
 *    - `tokens`: int64 tensor `[1, seq_len]`
 *    - `style`: float32 tensor `[1, 256]` (voice embedding)
 *    - `speed`: float32 scalar
 * 4. Output is `audio`: float32 PCM at 24 kHz — pack into WAV.
 *
 * This is the Audexa baseline port from ReadAloud. The original ReadAloud
 * `KokoroOnDeviceService` implements the project's `TTSService` interface
 * with `VoicePreset` voice handles; here the surface is intentionally
 * narrower — just `synthesize(text, voiceId, speed)` → WAV file — so it
 * plugs into Audexa's own `TtsEngine` later without a heavy voice-model
 * port.
 *
 * **Engine status**: scaffolded from the ReadAloud port. The model file
 * download/decode path matches what ReadAloud ships in production; the
 * tensor names + shapes follow the canonical onnx-community export
 * (`input_ids`, `style`, `speed`). If the user's chosen model variant
 * differs, [synthesize] throws and callers should fall back to cloud.
 */
class KokoroOnDeviceService(private val context: Context) {

    private var session: OrtSession? = null
    private val env: OrtEnvironment by lazy { OrtEnvironment.getEnvironment() }
    private val g2p by lazy { KokoroG2P(context) }

    /**
     * Cheap, non-suspend check used by the runtime factory to decide
     * whether to route here vs cloud. Returns true only when the session
     * is loaded — model must already be on disk.
     */
    fun isInferenceReady(): Boolean = session != null

    suspend fun isAvailable(): Boolean = withContext(Dispatchers.IO) {
        try {
            ensureSession() != null
        } catch (e: Exception) {
            Log.w(TAG, "isAvailable: session init failed — ${e.message}")
            false
        }
    }

    private fun ensureSession(): OrtSession? {
        session?.let { return it }
        val modelFile = KokoroModelDownloader.getInstance(context).modelFile
        if (!modelFile.exists()) {
            Log.i(TAG, "ensureSession: model file not present yet at ${modelFile.absolutePath}")
            return null
        }
        return try {
            val opts = OrtSession.SessionOptions().apply {
                // Use NNAPI if available, else CPU. NNAPI provides ANE-like
                // acceleration on supported devices.
                try { addNnapi() } catch (_: Throwable) { /* not all builds have NNAPI EP */ }
                setIntraOpNumThreads(2)
            }
            val s = env.createSession(modelFile.absolutePath, opts)
            session = s
            // Pre-warm the G2P side too — at 126K entries the lexicon JSON
            // parse is ~200-500ms on a Pixel, and doing it lazily on first
            // synth would push that latency onto the user's first tap.
            g2p.prewarm()
            s
        } catch (e: Exception) {
            Log.e(TAG, "ensureSession: createSession failed", e)
            null
        }
    }

    /**
     * Synthesize [text] using the bundled voice [voiceId] (one of
     * `af_heart`, `af_bella`, `am_michael`, `bf_emma`, `bm_george`) at
     * the given speed multiplier (1.0 = native). Returns a temp WAV file
     * in `cacheDir`. The caller is responsible for cleanup.
     */
    suspend fun synthesize(
        text: String,
        voiceId: String = DEFAULT_VOICE_ID,
        speed: Float = 1.0f,
    ): File = withContext(Dispatchers.IO) {
        val startMs = System.currentTimeMillis()
        // Kokoro's token context is ~500. Split long text into chunks
        // that fit, synth each, and concatenate the resulting PCM.
        val chunks = chunkTextForModel(text)
        Log.i(TAG, "synthesize: split ${text.length} chars into ${chunks.size} chunks (voice=$voiceId speed=$speed)")
        val pcmChunks = ArrayList<ShortArray>(chunks.size)
        var totalSamples = 0
        for ((i, chunk) in chunks.withIndex()) {
            Log.i(TAG, "synthesize: chunk ${i + 1}/${chunks.size} (${chunk.length} chars)")
            val chunkPcm = runInference(chunk, voiceId, speed)
            pcmChunks.add(chunkPcm)
            totalSamples += chunkPcm.size
        }
        val pcm = ShortArray(totalSamples)
        var offset = 0
        for (c in pcmChunks) {
            System.arraycopy(c, 0, pcm, offset, c.size)
            offset += c.size
        }
        val outFile = writeWavToFile(pcm, sampleRate = 24_000)
        val duration = pcm.size.toDouble() / 24_000.0
        Log.i(TAG, "synthesize: complete — ${duration}s of audio in ${System.currentTimeMillis() - startMs}ms")
        outFile
    }

    /**
     * Break long text into pieces small enough to fit Kokoro's ~500-token
     * context. We prefer to split on sentence boundaries; if a single
     * sentence overflows, we further split on commas, then by hard
     * character cap as a final fallback.
     *
     * The character cap (`CHUNK_CHAR_CAP`) is intentionally conservative —
     * worse to break mid-clause than to overflow the model and lose the
     * tail of a sentence.
     */
    private fun chunkTextForModel(text: String): List<String> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return emptyList()
        val sentences = SENTENCE_SPLIT.split(trimmed).map { it.trim() }.filter { it.isNotEmpty() }
        val chunks = ArrayList<String>()
        val current = StringBuilder()
        fun flushCurrent() {
            if (current.isNotEmpty()) {
                chunks.add(current.toString().trim())
                current.clear()
            }
        }
        for (s in sentences) {
            val pieces = if (s.length > CHUNK_CHAR_CAP) splitOverlongSentence(s) else listOf(s)
            for (piece in pieces) {
                val pieceLen = piece.length
                if (current.length + pieceLen + 1 > CHUNK_CHAR_CAP) {
                    flushCurrent()
                }
                if (current.isNotEmpty()) current.append(' ')
                current.append(piece)
            }
        }
        flushCurrent()
        return chunks
    }

    private fun splitOverlongSentence(s: String): List<String> {
        val byComma = s.split(",").map { it.trim() }.filter { it.isNotEmpty() }
        val out = ArrayList<String>()
        val cur = StringBuilder()
        for (part in byComma) {
            if (cur.length + part.length + 2 > CHUNK_CHAR_CAP) {
                if (cur.isNotEmpty()) {
                    out.add(cur.toString().trim())
                    cur.clear()
                }
                if (part.length > CHUNK_CHAR_CAP) {
                    // Truly pathological — hard cap.
                    var i = 0
                    while (i < part.length) {
                        val end = minOf(i + CHUNK_CHAR_CAP, part.length)
                        out.add(part.substring(i, end))
                        i = end
                    }
                    continue
                }
            }
            if (cur.isNotEmpty()) cur.append(", ")
            cur.append(part)
        }
        if (cur.isNotEmpty()) out.add(cur.toString().trim())
        return out
    }

    // ---- Inference internals ------------------------------------------------

    private fun runInference(text: String, voiceId: String, speed: Float): ShortArray {
        val sess = ensureSession()
            ?: throw IllegalStateException("Kokoro model not loaded — callers should check isInferenceReady()")

        // 1. Text → token IDs (G2P + tokenizer)
        val tokens = g2p.tokenize(text)
        if (tokens.isEmpty()) {
            return ShortArray(0)
        }
        Log.i(TAG, "runInference: tokens.size=${tokens.size} speed=$speed text.len=${text.length}")

        // 2. Voice embedding (256-dim fp32) — kokoro-onnx indexes the voice
        // pack by `len(tokens) - 1`, i.e. leading $ + phonemes, excluding
        // the trailing $. Picking the wrong slice produces silence or noise.
        val phonemeCount = tokens.size - 1
        val styleVec = g2p.voiceEmbedding(voiceId, phonemeCount)

        // 3. Build tensors. The kokoro-onnx export uses these input names;
        // if the user's specific model variant differs we throw and fall
        // back to cloud at the factory level.
        val tokenTensor = OnnxTensor.createTensor(
            env,
            LongBuffer.wrap(tokens.map { it.toLong() }.toLongArray()),
            longArrayOf(1, tokens.size.toLong()),
        )
        val styleTensor = OnnxTensor.createTensor(
            env,
            FloatBuffer.wrap(styleVec),
            longArrayOf(1, styleVec.size.toLong()),
        )
        val speedTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(floatArrayOf(speed)), longArrayOf(1))

        // Input names from the kokoro-onnx export: `input_ids`, `style`,
        // `speed` (observed empirically: 1.20 onnx-community export uses
        // `input_ids` rather than the `tokens` name some other variants use).
        val inputs = mapOf(
            "input_ids" to tokenTensor,
            "style" to styleTensor,
            "speed" to speedTensor,
        )

        try {
            val startMs = System.currentTimeMillis()
            sess.run(inputs).use { result ->
                Log.i(TAG, "runInference: sess.run completed in ${System.currentTimeMillis() - startMs}ms, outputs=${result.size()}")
                val audioTensor = result.get(0)
                val raw = when (val v = audioTensor.value) {
                    is FloatArray -> v
                    is Array<*> -> {
                        // Some exports return `[1, samples]` rather than a flat
                        // float array; unwrap one batch dim if so.
                        @Suppress("UNCHECKED_CAST")
                        (v[0] as FloatArray)
                    }
                    else -> throw IllegalStateException("Unexpected audio tensor type: ${v?.javaClass}")
                }
                Log.i(TAG, "runInference: audio samples=${raw.size} (~${"%.2f".format(raw.size / 24_000.0)}s)")
                // Convert FP32 [-1.0, 1.0] PCM → Int16 PCM.
                val out = ShortArray(raw.size)
                for (i in raw.indices) {
                    val v = (raw[i] * 32_767f).coerceIn(-32_768f, 32_767f)
                    out[i] = v.toInt().toShort()
                }
                return out
            }
        } finally {
            tokenTensor.close()
            styleTensor.close()
            speedTensor.close()
        }
    }

    private fun writeWavToFile(pcm: ShortArray, sampleRate: Int): File {
        val outFile = File.createTempFile("kokoro_", ".wav", context.cacheDir)
        val byteBuffer = ByteArrayOutputStream()
        val numSamples = pcm.size
        val dataSize = numSamples * 2

        // RIFF/WAVE header — 44 bytes
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray())
            putInt(36 + dataSize)
            put("WAVE".toByteArray())
            put("fmt ".toByteArray())
            putInt(16)             // PCM fmt chunk size
            putShort(1.toShort())  // PCM format
            putShort(1.toShort())  // mono
            putInt(sampleRate)
            putInt(sampleRate * 2) // byte rate
            putShort(2.toShort())  // block align
            putShort(16.toShort()) // bits/sample
            put("data".toByteArray())
            putInt(dataSize)
        }.array()
        byteBuffer.write(header)

        val pcmBytes = ByteBuffer.allocate(dataSize).order(ByteOrder.LITTLE_ENDIAN)
        pcm.forEach { pcmBytes.putShort(it) }
        byteBuffer.write(pcmBytes.array())

        FileOutputStream(outFile).use { it.write(byteBuffer.toByteArray()) }
        return outFile
    }

    companion object {
        private const val TAG = "KokoroOnDeviceTTS"

        /** Bundled voice IDs — these match the raw resources copied from ReadAloud. */
        const val DEFAULT_VOICE_ID = "af_heart"
        val BUNDLED_VOICES = listOf("af_heart", "af_bella", "am_michael", "bf_emma", "bm_george")

        // Conservative char cap per chunk. Kokoro's hard limit is ~500
        // tokens; English averages ~1.2 tokens/char with our crude G2P, so
        // 350 chars keeps us comfortably under the limit even on
        // phoneme-dense passages.
        private const val CHUNK_CHAR_CAP = 350

        private val SENTENCE_SPLIT = Regex("(?<=[.!?])\\s+")
    }
}
