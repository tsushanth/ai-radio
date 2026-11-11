package com.kreativekoala.audexa

import com.kreativekoala.audexa.data.remote.AuthRoutes
import com.kreativekoala.audexa.data.remote.AuthTokenInterceptor
import com.kreativekoala.audexa.data.remote.SessionTokenSource
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthTokenInterceptorTest {
    private val base = "https://api.example.com/api".toHttpUrl()

    private class FakeTokens(var current: String?, var refreshed: String? = null) : SessionTokenSource {
        var currentCalls = 0
        var refreshCalls = 0
        override fun currentToken(): String? { currentCalls++; return current }
        override fun refreshedToken(): String? { refreshCalls++; return refreshed }
    }

    /** Runs [request] through the interceptor; [server] answers each request that gets past it and records what it saw. */
    private fun run(tokens: SessionTokenSource, request: Request, server: (Request) -> Int): Pair<Response, List<Request>> {
        val seen = mutableListOf<Request>()
        val terminal = Interceptor { chain ->
            seen += chain.request()
            Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1)
                .code(server(chain.request())).message("x")
                .body("{}".toResponseBody("application/json".toMediaType())).build()
        }
        val client = OkHttpClient.Builder().addInterceptor(AuthTokenInterceptor(base, tokens)).addInterceptor(terminal).build()
        return client.newCall(request).execute() to seen
    }

    private fun get(path: String, host: String = "api.example.com") =
        Request.Builder().url("https://$host/api/$path").build()

    private fun post(path: String) =
        Request.Builder().url("https://api.example.com/api/$path").post("{}".toRequestBody("application/json".toMediaType())).build()

    @Test fun signedInUserGetsTheBearerTokenOnEveryProtectedRoute() {
        val requests = listOf(
            post("podcast/generate-async"),
            post("podcast/script"),
            get("podcast/job/job_123"),
            get("podcast/episodes/me%40example.com?limit=1&offset=0"),
            post("linked-accounts/me%40example.com"),
            get("linked-accounts/me%40example.com"),
            Request.Builder().url("https://api.example.com/api/linked-accounts/me%40example.com/acc_1").delete().build(),
            post("topics/suggest"),
        )
        for (r in requests) {
            val (resp, seen) = run(FakeTokens("tok-1"), r) { 200 }
            assertEquals(r.url.toString(), 200, resp.code)
            assertEquals(r.url.toString(), "Bearer tok-1", seen.single().header("Authorization"))
        }
    }

    @Test fun guestRequestsGoOutUnchanged() {
        val tokens = FakeTokens(null)
        val (resp, seen) = run(tokens, post("podcast/generate-async")) { 200 }
        assertEquals(200, resp.code)
        assertNull(seen.single().header("Authorization"))
        assertEquals("no refresh attempt for a guest", 0, tokens.refreshCalls)
    }

    @Test fun routesThatTakeNoTokenNeverGetOne() {
        val tokens = FakeTokens("tok-1")
        for (r in listOf(get("topics"), get("topics/tech/episode"), get("discover"), get("voices"), get("for-you/me%40example.com"),
            get("user/me%40example.com"), post("podcast/generate"), post("ads/impression"), post("ask"), get("ask/abc"))) {
            val (_, seen) = run(tokens, r) { 200 }
            assertNull(r.url.toString(), seen.single().header("Authorization"))
        }
        assertEquals("the token source is not even asked", 0, tokens.currentCalls)
    }

    @Test fun theTokenIsNeverSentToAnotherHost() {
        val (_, seen) = run(FakeTokens("tok-1"), get("podcast/episodes/x", host = "evil.example.net")) { 200 }
        assertNull(seen.single().header("Authorization"))
        val http = Request.Builder().url("http://api.example.com/api/podcast/episodes/x").build()
        assertNull(run(FakeTokens("tok-1"), http) { 200 }.second.single().header("Authorization"))
    }

    @Test fun aHeaderTheCallerSetItselfIsKept() {
        val r = Request.Builder().url("https://api.example.com/api/linked-accounts/a%40b.c")
            .header("Authorization", "Bearer from-caller").build()
        val tokens = FakeTokens("tok-1")
        val (_, seen) = run(tokens, r) { 200 }
        assertEquals("Bearer from-caller", seen.single().header("Authorization"))
        assertEquals(0, tokens.currentCalls)
    }

    @Test fun serverRefusalRefreshesOnceAndRetriesWithTheNewToken() {
        val tokens = FakeTokens("old", refreshed = "new")
        val (resp, seen) = run(tokens, get("podcast/episodes/x")) { req -> if (req.header("Authorization") == "Bearer new") 200 else 401 }
        assertEquals(200, resp.code)
        assertEquals(listOf("Bearer old", "Bearer new"), seen.map { it.header("Authorization") })
        assertEquals(1, tokens.refreshCalls)
    }

    @Test fun ifTheRefreshedTokenIsRefusedToo_theLastTryGoesOutWithoutAToken() {
        val tokens = FakeTokens("old", refreshed = "new")
        val (resp, seen) = run(tokens, get("podcast/episodes/x")) { req -> if (req.header("Authorization") == null) 200 else 401 }
        assertEquals(200, resp.code)
        assertEquals(listOf("Bearer old", "Bearer new", null), seen.map { it.header("Authorization") })
    }

    @Test fun noFreshTokenAvailable_stillFallsBackOnce_andAFinal401IsReturned() {
        val tokens = FakeTokens("old", refreshed = null)
        val (resp, seen) = run(tokens, get("podcast/episodes/x")) { 401 }
        assertEquals(401, resp.code)
        assertEquals(listOf("Bearer old", null), seen.map { it.header("Authorization") })
    }

    @Test fun aForbiddenIsNotRetried() {
        val tokens = FakeTokens("tok-1", refreshed = "new")
        val (resp, seen) = run(tokens, get("linked-accounts/someone%40else.com")) { 403 }
        assertEquals(403, resp.code)
        assertEquals(1, seen.size)
        assertEquals(0, tokens.refreshCalls)
    }

    @Test fun retriedPostKeepsItsBody() {
        val tokens = FakeTokens("old", refreshed = "new")
        val bodies = mutableListOf<String>()
        val seenAuth = mutableListOf<String?>()
        val terminal = Interceptor { chain ->
            val buf = okio.Buffer(); chain.request().body!!.writeTo(buf); bodies += buf.readUtf8()
            seenAuth += chain.request().header("Authorization")
            Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1)
                .code(if (chain.request().header("Authorization") == "Bearer new") 202 else 401).message("x")
                .body("{}".toResponseBody("application/json".toMediaType())).build()
        }
        val client = OkHttpClient.Builder().addInterceptor(AuthTokenInterceptor(base, tokens)).addInterceptor(terminal).build()
        val req = Request.Builder().url("https://api.example.com/api/podcast/generate-async")
            .post("""{"user_id":"me@example.com"}""".toRequestBody("application/json".toMediaType())).build()
        assertEquals(202, client.newCall(req).execute().code)
        assertEquals(listOf("""{"user_id":"me@example.com"}""", """{"user_id":"me@example.com"}"""), bodies)
        assertEquals(listOf<String?>("Bearer old", "Bearer new"), seenAuth)
    }

    @Test fun routeTableMatchesOnlyTheBackendRoutesThatTakeAToken() {
        fun wants(method: String, path: String): Boolean {
            val b = if (method == "GET") null else "{}".toRequestBody()
            return AuthRoutes.wantsToken(base, Request.Builder().url("https://api.example.com/api/$path").method(method, b).build())
        }
        assertTrue(wants("POST", "podcast/generate-async"))
        assertTrue(wants("POST", "podcast/script"))
        assertTrue(wants("GET", "podcast/job/job_1"))
        assertTrue(wants("GET", "podcast/episodes/u"))
        assertTrue(wants("DELETE", "user/u"))
        assertFalse(wants("GET", "user/u"))
        assertFalse(wants("PUT", "user/u/preferences"))
        assertFalse(wants("GET", "podcast/script"))
        assertFalse(wants("GET", "topics/suggest"))
        assertFalse(wants("GET", "linked-accounts") )
        // a path that only looks like the base
        assertFalse(AuthRoutes.wantsToken(base, Request.Builder().url("https://api.example.com/other/podcast/episodes/u").build()))
    }
}
