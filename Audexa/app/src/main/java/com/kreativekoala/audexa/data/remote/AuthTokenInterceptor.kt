package com.kreativekoala.audexa.data.remote

import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response

/** Where the interceptor gets the signed-in user's session token. Blocking: it runs on an OkHttp worker thread. */
interface SessionTokenSource {
    /** The token for the account the app is acting as, or null when signed out / guest / no session. Refreshes it when about to expire. */
    fun currentToken(): String?

    /** Forces a refresh (the server just refused the token). Null when there is no session or the refresh failed. */
    fun refreshedToken(): String?
}

/**
 * Adds "Authorization: Bearer <session token>" to the per-user routes listed in [AuthRoutes].
 *
 *  - guest / signed out (no token): the request goes out unchanged, exactly as before;
 *  - a header the caller set itself (Delete Account) is left alone;
 *  - the server answers 401 (expired or revoked): refresh once and retry once with the new token; if that is also refused,
 *    send it one last time without a token, so that while the backend still has its legacy window a dead session does not break the
 *    Daily Brief (once the window is closed that last request gets the same 401 it would have got anyway).
 */
class AuthTokenInterceptor(
    private val apiBase: HttpUrl,
    private val tokens: SessionTokenSource,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header("Authorization") != null || !AuthRoutes.wantsToken(apiBase, request)) return chain.proceed(request)

        val token = tokens.currentToken() ?: return chain.proceed(request)
        val first = chain.proceed(request.withBearer(token))
        if (first.code != 401) return first

        first.close()
        val fresh = tokens.refreshedToken()
        if (fresh != null && fresh != token) {
            val second = chain.proceed(request.withBearer(fresh))
            if (second.code != 401) return second
            second.close()
        }
        return chain.proceed(request)
    }

    private fun Request.withBearer(token: String): Request = newBuilder().header("Authorization", "Bearer $token").build()
}
