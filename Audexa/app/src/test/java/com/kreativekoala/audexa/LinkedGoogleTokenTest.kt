package com.kreativekoala.audexa

import com.kreativekoala.audexa.data.remote.LinkedGoogleToken
import org.junit.Assert.assertEquals
import org.junit.Test

class LinkedGoogleTokenTest {
    private val gmail = LinkedGoogleToken.GMAIL_MODIFY_SCOPE
    private val calendar = LinkedGoogleToken.CALENDAR_READONLY_SCOPE

    @Test
    fun bothFeaturesAskForOneTokenCoveringBothThenEachAlone() {
        assertEquals(
            listOf("oauth2:$gmail $calendar", "oauth2:$gmail", "oauth2:$calendar"),
            LinkedGoogleToken.candidates(emailEnabled = true, calendarEnabled = true)
        )
    }

    @Test
    fun oneFeatureAsksOnlyForItAndNoneAsksForNothing() {
        assertEquals(listOf("oauth2:$gmail"), LinkedGoogleToken.candidates(true, false))
        assertEquals(listOf("oauth2:$calendar"), LinkedGoogleToken.candidates(false, true))
        assertEquals(emptyList<String>(), LinkedGoogleToken.candidates(false, false))
    }
}
