package com.kreativekoala.audexa

import com.kreativekoala.audexa.data.remote.LinkedAccountOwner
import com.kreativekoala.audexa.data.remote.SessionTokenRules
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

class SessionTokenRulesTest {
    private fun jwt(payload: String) =
        "h." + Base64.getUrlEncoder().withoutPadding().encodeToString(payload.toByteArray()) + ".s"

    @Test fun refreshesWhenAboutToExpireOrExpired() {
        assertTrue(SessionTokenRules.needsRefresh(expiresAtEpochSeconds = 1_000, nowEpochSeconds = 1_000))
        assertTrue(SessionTokenRules.needsRefresh(1_050, 1_000))
        assertTrue(SessionTokenRules.needsRefresh(900, 1_000))
        assertFalse(SessionTokenRules.needsRefresh(1_061, 1_000))
        assertFalse(SessionTokenRules.needsRefresh(4_600, 1_000))
    }

    @Test fun tokenOnlyGoesOutForTheAccountTheAppIsActingAs() {
        assertEquals("tok", SessionTokenRules.tokenIfFor("Me@Example.com", " me@example.com ", "tok"))
        assertNull("leftover session of someone else", SessionTokenRules.tokenIfFor("me@example.com", "other@example.com", "tok"))
        assertNull("guest has no email", SessionTokenRules.tokenIfFor("", "me@example.com", "tok"))
        assertNull(SessionTokenRules.tokenIfFor(null, "me@example.com", "tok"))
        assertNull("session without an email", SessionTokenRules.tokenIfFor("me@example.com", null, "tok"))
        assertNull(SessionTokenRules.tokenIfFor("me@example.com", "me@example.com", " "))
    }

    @Test fun readsTheEmailClaimOfAJwt() {
        assertEquals("me@example.com", SessionTokenRules.emailClaim(jwt("""{"sub":"1","email":"me@example.com"}""")))
        assertNull(SessionTokenRules.emailClaim(jwt("""{"sub":"1"}""")))
        assertNull(SessionTokenRules.emailClaim("not-a-jwt"))
        assertNull(SessionTokenRules.emailClaim(jwt("not json")))
    }

    @Test fun linkedAccountsAreFiledUnderTheSignedInAccount() {
        // Signed in as A, linking Gmail B: the server compares the token (A) with the URL user, and the brief is generated for A.
        assertEquals("a@example.com", LinkedAccountOwner.userIdFor("a@example.com", "b@gmail.com"))
        assertEquals("a@example.com", LinkedAccountOwner.userIdFor(" a@example.com ", "a@example.com"))
    }

    @Test fun aGuestFilesTheLinkUnderTheAccountBeingLinked() {
        assertEquals("b@gmail.com", LinkedAccountOwner.userIdFor(null, "b@gmail.com"))
        assertEquals("b@gmail.com", LinkedAccountOwner.userIdFor("", "b@gmail.com"))
        assertEquals("b@gmail.com", LinkedAccountOwner.userIdFor("  ", "b@gmail.com"))
    }
}
