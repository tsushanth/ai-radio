package com.kreativekoala.audexa.data.model

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Podcast languages the SERVER currently generates beyond the six built in (en es fr de pt it): `GET /api/config/languages`
 * lists the enabled ones with a Beta flag. Turning a language on or off on the server changes the picker without an app release.
 *
 * Pure Kotlin (no Android classes) so it runs in JVM unit tests. Until a list has been loaded (network or the copy saved by the
 * last successful load) no remote language is offered, exactly as before this feature.
 */
object RemoteLanguages {
    data class Entry(val code: String, val beta: Boolean, val paused: Boolean)

    private val entries = MutableStateFlow<Map<String, Entry>?>(null)
    private val versionFlow = MutableStateFlow(0)

    /** Changes every time the list changes: collect it to re-read [isEnabled] / the picker list. */
    val version: StateFlow<Int> = versionFlow.asStateFlow()

    val isLoaded: Boolean get() = entries.value != null

    fun update(list: List<Entry>) {
        entries.value = list.associateBy { it.code.lowercase() }
        versionFlow.value = versionFlow.value + 1
    }

    /** Test hook and "forget" for tooling: back to the never-loaded state. */
    fun clear() {
        entries.value = null
        versionFlow.value = versionFlow.value + 1
    }

    fun isEnabled(code: String): Boolean = entries.value?.containsKey(code.lowercase()) == true
    fun isBeta(code: String): Boolean = entries.value?.get(code.lowercase())?.beta == true
    fun enabledCodes(): Set<String> = entries.value?.keys.orEmpty()

    @Serializable
    private data class LanguageDto(
        val code: String = "",
        val status: String = "",
        val beta: Boolean = false,
    )

    @Serializable
    private data class DataDto(val languages: List<LanguageDto> = emptyList())

    @Serializable
    private data class ResponseDto(
        val success: Boolean = false,
        val data: DataDto? = null,
        @SerialName("error") val error: String? = null,
    )

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** Parses the server answer. Null when it is not a valid answer (keep whatever list was loaded before). */
    fun parse(body: String?): List<Entry>? {
        if (body.isNullOrBlank()) return null
        val r = runCatching { json.decodeFromString<ResponseDto>(body) }.getOrNull() ?: return null
        if (!r.success || r.data == null) return null
        return r.data.languages
            .filter { it.code.length in 2..3 && it.code.all { c -> c in 'a'..'z' } }
            .map { Entry(it.code, it.beta, paused = it.status == "paused") }
    }

    /** "cs:b,nl:" style string saved on the phone so the list is known before the network answers. */
    fun encode(list: Collection<Entry>): String = list.joinToString(",") { "${it.code}:${if (it.beta) "b" else ""}" }

    fun decode(saved: String?): List<Entry> = saved.orEmpty().split(',').mapNotNull { part ->
        val code = part.substringBefore(':').trim()
        if (code.length in 2..3 && code.all { it in 'a'..'z' }) Entry(code, part.substringAfter(':', "").trim() == "b", paused = false) else null
    }
}
