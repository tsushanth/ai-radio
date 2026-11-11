package com.kreativekoala.audexa.data.remote

import okhttp3.HttpUrl
import okhttp3.Request

/**
 * Which backend calls act for one signed-in user and therefore take the session token
 * (ai-radio-backend src/lib/user-auth.ts: requireUser / requireSelf / optionalUser).
 *
 * An allow-list on purpose: the token is only attached to our own API host and only to these routes, so it is never sent to another
 * host and never to a public route that has no use for it.
 */
object AuthRoutes {
    /** True when [request] targets a per-user route under [apiBase] (e.g. https://host/api). */
    fun wantsToken(apiBase: HttpUrl, request: Request): Boolean {
        val url = request.url
        if (url.scheme != apiBase.scheme || url.host != apiBase.host || url.port != apiBase.port) return false
        val base = apiBase.pathSegments.filter { it.isNotEmpty() }
        val all = url.pathSegments.filter { it.isNotEmpty() }
        if (all.size <= base.size || all.subList(0, base.size) != base) return false
        val rel = all.subList(base.size, all.size)
        val method = request.method.uppercase()
        return when (rel[0]) {
            // POST /podcast/generate-async, POST /podcast/script, GET /podcast/job/:id, GET /podcast/episodes/:userId
            "podcast" -> when {
                rel.size == 2 && method == "POST" && (rel[1] == "generate-async" || rel[1] == "script") -> true
                rel.size == 3 && method == "GET" && (rel[1] == "job" || rel[1] == "episodes") -> true
                else -> false
            }
            // GET/POST /linked-accounts/:userId, DELETE /linked-accounts/:userId/:accountId
            "linked-accounts" -> rel.size >= 2
            // DELETE /user/:userId (the Delete Account call sets its own header; this only covers other callers)
            "user" -> rel.size == 2 && method == "DELETE"
            // POST /topics/suggest: with a token the suggestion is filed under the account, so Delete Account can remove it
            "topics" -> rel.size == 2 && rel[1] == "suggest" && method == "POST"
            else -> false
        }
    }
}
