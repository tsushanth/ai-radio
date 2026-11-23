package com.kreativekoala.audexa.util

import androidx.annotation.StringRes
import com.kreativekoala.audexa.R

/**
 * Maps the stable `error.code` the backend sends with a failed generation job to a string resource, so the message follows the
 * app language. The backend `message` is English only; it stays in the response and is the fallback for a code this build does
 * not know (a newer server code, or no code at all).
 */
object JobErrorMessages {
    @StringRes
    fun resFor(code: String?): Int? = when (code) {
        "TOKEN_EXPIRED", "TOKEN_REVOKED", "TOKEN_INVALID", "REAUTH_REQUIRED" -> R.string.job_error_relink
        "NO_EMAILS", "INSUFFICIENT_CONTENT" -> R.string.job_error_no_content
        "SCRIPT_GENERATION_FAILED", "INVALID_SCRIPT_FORMAT", "TTS_FAILED", "STORAGE_ERROR", "DATABASE_ERROR" -> R.string.job_error_retry
        "UNKNOWN_ERROR" -> R.string.job_error_unknown
        else -> null
    }
}
