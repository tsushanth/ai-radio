package com.kreativekoala.audexa.tts

import android.content.Context
import android.media.MediaPlayer
import android.util.Log
import com.kreativekoala.audexa.tts.kokoro.KokoroModelDownloader
import com.kreativekoala.audexa.tts.kokoro.KokoroOnDeviceService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * On-device [TtsEngine] backed by Kokoro 82M via ONNX Runtime.
 *
 * The synthesis engine ([KokoroOnDeviceService]) renders a WAV file to
 * `cacheDir`; this engine plays it back via [MediaPlayer]. Pause/resume/stop
 * map cleanly to MediaPlayer's lifecycle, so we get the full [TtsEngine]
 * contract without an AudioTrack buffer pump.
 *
 * Phase B engine (per the docstring on [TtsEngine]). The system-TTS
 * [SystemTtsEngine] remains the default for unsupported devices and
 * non-English content; the eventual coordinator picks between them.
 */
class KokoroTtsEngine(private val context: Context) : TtsEngine {

    companion object {
        private const val TAG = "KokoroTtsEngine"

        /** Bundled voices, surfaced through [voices]. Display names match the model card. */
        private val BUNDLED_VOICES = listOf(
            TtsVoice(id = "af_heart",   displayName = "Heart (US-EN)",    locale = "en-US", isFemale = true,  isOnDevice = true),
            TtsVoice(id = "af_bella",   displayName = "Bella (US-EN)",    locale = "en-US", isFemale = true,  isOnDevice = true),
            TtsVoice(id = "am_michael", displayName = "Michael (US-EN)",  locale = "en-US", isFemale = false, isOnDevice = true),
            TtsVoice(id = "bf_emma",    displayName = "Emma (UK-EN)",     locale = "en-GB", isFemale = true,  isOnDevice = true),
            TtsVoice(id = "bm_george",  displayName = "George (UK-EN)",   locale = "en-GB", isFemale = false, isOnDevice = true),
        )
    }

    private val _state = MutableStateFlow<TtsState>(TtsState.Idle)
    override val state: StateFlow<TtsState> = _state.asStateFlow()

    private val _voices = MutableStateFlow(BUNDLED_VOICES)
    override val voices: StateFlow<List<TtsVoice>> = _voices.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val downloader = KokoroModelDownloader.getInstance(context)
    private val service = KokoroOnDeviceService(context)

    private var player: MediaPlayer? = null
    private var currentAudioFile: File? = null
    private var prepared = false

    override suspend fun prepare() {
        if (prepared && service.isInferenceReady()) {
            _state.value = TtsState.Ready
            return
        }
        _state.value = TtsState.Preparing

        // Trigger the download if the model isn't on disk yet. Idempotent —
        // safe to call repeatedly.
        downloader.startIfPossible()

        // Wait for the downloader to settle into Ready or Failed.
        val finalState = downloader.state.first { s ->
            s is KokoroModelDownloader.State.Ready || s is KokoroModelDownloader.State.Failed
        }

        when (finalState) {
            is KokoroModelDownloader.State.Failed -> {
                _state.value = TtsState.Failed(finalState.message)
                return
            }
            is KokoroModelDownloader.State.Ready -> {
                // Load the ONNX session + warm G2P (lexicon parse can be slow).
                val ready = service.isAvailable()
                if (!ready) {
                    _state.value = TtsState.Failed("Kokoro model file present but ONNX session failed to load")
                    return
                }
                prepared = true
                _state.value = TtsState.Ready
            }
            else -> {
                // Defensive: first { } above filters to Ready/Failed only.
                _state.value = TtsState.Failed("Unexpected downloader state: $finalState")
            }
        }
    }

    override suspend fun speak(text: String, voiceId: String?, speed: Float) {
        if (!service.isInferenceReady()) {
            // prepare() lazily — most callers will have already done so, but
            // this keeps the API forgiving.
            prepare()
            if (_state.value is TtsState.Failed) return
        }

        // Synthesize to a WAV file (slow — runs on Dispatchers.IO inside service).
        _state.value = TtsState.Speaking(progressFraction = 0f)
        val wav = try {
            service.synthesize(
                text = text,
                voiceId = voiceId ?: KokoroOnDeviceService.DEFAULT_VOICE_ID,
                speed = speed,
            )
        } catch (e: Exception) {
            Log.e(TAG, "speak: synthesis failed", e)
            _state.value = TtsState.Failed("Synthesis failed: ${e.message}")
            return
        }

        // Hand off to MediaPlayer on the main thread.
        withContext(Dispatchers.Main) {
            currentAudioFile = wav
            releasePlayer()
            player = MediaPlayer().apply {
                setDataSource(wav.absolutePath)
                setOnPreparedListener {
                    Log.i(TAG, "speak: starting playback (${duration}ms)")
                    start()
                }
                setOnCompletionListener {
                    Log.i(TAG, "speak: playback complete")
                    _state.value = TtsState.Ready
                    releasePlayer()
                    wav.delete()
                }
                setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "speak: MediaPlayer error what=$what extra=$extra")
                    _state.value = TtsState.Failed("Playback error (code=$what)")
                    releasePlayer()
                    wav.delete()
                    true
                }
                prepareAsync()
            }
            // Surface a "started" state immediately so the UI can switch icons.
            // True progress would require a timer driven off `currentPosition`.
            _state.value = TtsState.Speaking(progressFraction = 0f)
        }
    }

    override fun pause() {
        player?.takeIf { it.isPlaying }?.let {
            it.pause()
            _state.value = TtsState.Paused
        }
    }

    override fun resume() {
        player?.let {
            if (!it.isPlaying) {
                it.start()
                _state.value = TtsState.Speaking(progressFraction = 0f)
            }
        }
    }

    override fun stop() {
        releasePlayer()
        currentAudioFile?.delete()
        currentAudioFile = null
        if (_state.value is TtsState.Speaking || _state.value is TtsState.Paused) {
            _state.value = TtsState.Ready
        }
    }

    override fun release() {
        stop()
        scope.cancel()
        prepared = false
        _state.value = TtsState.Idle
    }

    private fun releasePlayer() {
        player?.runCatching { stop() }
        player?.release()
        player = null
    }
}
