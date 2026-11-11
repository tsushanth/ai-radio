package com.kreativekoala.audexa.data.remote

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.Base64

/** Pure rules behind SupabaseSessionTokens (kept free of Android and Supabase types so they can be unit tested). */
object SessionTokenRules {
    /** Refresh when the token expires within this many seconds. */
    const val REFRESH_MARGIN_SECONDS = 60L

    fun needsRefresh(expiresAtEpochSeconds: Long, nowEpochSeconds: Long): Boolean =
        expiresAtEpochSeconds - nowEpochSeconds <= REFRESH_MARGIN_SECONDS

    /**
     * The token only goes out when it belongs to the account the app is acting as. The server answers 403 when the token's email
     * differs from the user in the request, so a leftover session of another account must not be sent (the request then goes out
     * without a token, as it did before).
     */
    fun tokenIfFor(appEmail: String?, sessionEmail: String?, accessToken: String): String? {
        val app = appEmail?.trim()?.lowercase().orEmpty()
        val session = sessionEmail?.trim()?.lowercase().orEmpty()
        return if (app.isNotEmpty() && app == session && accessToken.isNotBlank()) accessToken else null
    }

    /** The "email" claim of a JWT (used when the cached session carries no user object). No signature check: the server does that. */
    fun emailClaim(jwt: String): String? = try {
        val payload = jwt.split('.').getOrNull(1) ?: return null
        val json = String(Base64.getUrlDecoder().decode(payload))
        (Json.parseToJsonElement(json) as? JsonObject)?.get("email")?.jsonPrimitive?.contentOrNull
    } catch (_: Exception) {
        null
    }
}

/**
 * Which user id the signed-in app files linked accounts (Gmail / Calendar) under. The server only accepts a request when the
 * session token's email equals this id, and it is also the id the Daily Brief is generated for (the signed-in email).
 */
object LinkedAccountOwner {
    /** The signed-in account's email; a guest (no email yet) is filed under the account being linked. */
    fun userIdFor(signedInEmail: String?, linkedEmail: String): String =
        signedInEmail?.trim()?.takeIf { it.isNotEmpty() } ?: linkedEmail
}
