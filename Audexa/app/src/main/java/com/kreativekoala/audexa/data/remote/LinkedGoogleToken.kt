package com.kreativekoala.audexa.data.remote

/** Which access token to ask Play services for, given the linked Google features that are switched on. */
object LinkedGoogleToken {
    const val GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify"
    const val CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"

    /**
     * Scope strings to try, widest first. The server keeps one token per account, so it should cover both features; a user who
     * granted only one of them still gets a token for it. Empty when both are off.
     */
    fun candidates(emailEnabled: Boolean, calendarEnabled: Boolean): List<String> {
        val wanted = listOfNotNull(
            GMAIL_MODIFY_SCOPE.takeIf { emailEnabled },
            CALENDAR_READONLY_SCOPE.takeIf { calendarEnabled }
        )
        val sets = if (wanted.size > 1) listOf(wanted) + wanted.map { listOf(it) } else listOf(wanted)
        return sets.filter { it.isNotEmpty() }.map { "oauth2:" + it.joinToString(" ") }
    }
}
