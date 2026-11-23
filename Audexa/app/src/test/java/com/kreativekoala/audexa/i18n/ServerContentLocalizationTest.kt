package com.kreativekoala.audexa.i18n

import com.kreativekoala.audexa.util.CategoryTitles
import com.kreativekoala.audexa.util.JobErrorMessages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Server-written text is shown through string resources: job error codes and category names map to a resource that exists in every
 * shipped language, and a code this build does not know falls back to the server's message.
 */
class ServerContentLocalizationTest {
    private val en = StringResources.default
    private val allFolders = StringResources.localeFolders

    /** The codes the backend can send, read from the backend source when this test runs inside the full repository. */
    private fun backendCodes(): List<String> {
        val file = listOf("../../ai-radio-backend/src/types/podcast-errors.ts", "../ai-radio-backend/src/types/podcast-errors.ts", "ai-radio-backend/src/types/podcast-errors.ts")
            .map { File(it) }.firstOrNull { it.isFile } ?: return emptyList()
        val enumBody = file.readText().substringAfter("export enum PodcastErrorCode {").substringBefore("}")
        return Regex("([A-Z_]+) = '([A-Z_]+)'").findAll(enumBody).map { it.groupValues[2] }.toList()
    }

    @Test fun everyBackendJobErrorCodeMapsToAResourceThatExistsInEveryLanguage() {
        val codes = backendCodes().ifEmpty { listOf("TOKEN_EXPIRED", "NO_EMAILS", "SCRIPT_GENERATION_FAILED", "UNKNOWN_ERROR") }
        for (code in codes) {
            assertNotNull("no string for backend error code $code", JobErrorMessages.resFor(code))
        }
        val keys = setOf("job_error_relink", "job_error_no_content", "job_error_retry", "job_error_unknown")
        for (folder in allFolders + "values") {
            val s = if (folder == "values") en else StringResources.load(folder)
            for (k in keys) assertTrue("$folder is missing $k", !s.strings[k].isNullOrBlank())
        }
    }

    @Test fun anUnknownOrMissingCodeFallsBackToTheServerMessage() {
        assertNull(JobErrorMessages.resFor("SOME_NEW_SERVER_CODE"))
        assertNull(JobErrorMessages.resFor(null))
        assertNull(JobErrorMessages.resFor(""))
    }

    @Test fun reconnectCodesAllUseTheReconnectText() {
        val relink = JobErrorMessages.resFor("TOKEN_EXPIRED")
        for (c in listOf("TOKEN_REVOKED", "TOKEN_INVALID", "REAUTH_REQUIRED")) assertEquals(relink, JobErrorMessages.resFor(c))
    }

    @Test fun everyBackendCategoryHasATitleInEveryLanguage() {
        val ids = listOf("news", "technology", "business", "science", "lifestyle", "entertainment", "sports")
        for (id in ids) assertNotNull("no category string for $id", CategoryTitles.resFor(id))
        assertNull(CategoryTitles.resFor("general"))
        for (folder in allFolders + "values") {
            val s = if (folder == "values") en else StringResources.load(folder)
            for (id in ids) assertTrue("$folder is missing category_$id", !s.strings["category_$id"].isNullOrBlank())
            // No two categories share a title in one language (a row of chips must be distinguishable).
            assertEquals("$folder has duplicate category titles", ids.size, ids.map { s.strings["category_$it"] }.toSet().size)
        }
    }

    @Test fun radioChatAndVoiceMessagesExistInEveryLanguage() {
        val keys = listOf("radio_topic_placeholder", "chat_you", "chat_listener", "chat_blocked_language", "chat_blocked_phone",
            "chat_blocked_email", "chat_blocked_id", "chat_blocked_card", "radio_request_queued", "voice_on_device_button",
            "kokoro_err_checksum", "kokoro_err_rename", "kokoro_err_unknown", "kokoro_err_download")
        for (folder in allFolders) {
            val s = StringResources.load(folder)
            for (k in keys) assertTrue("$folder is missing $k", !s.strings[k].isNullOrBlank())
        }
    }
}
