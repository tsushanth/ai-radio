package com.kreativekoala.audexa.data.repository

import retrofit2.HttpException

/** The app has no usable Supabase session token (never signed in to Supabase, or the session could not be refreshed). */
class SessionExpiredException : Exception("Sign-in expired")

/** Why Delete Account did not finish, in terms the profile screen can explain. */
enum class DeleteFailure {
    /** The server refused (or we could not even send) the session token: the user must sign in again. Nothing was deleted. */
    SESSION_EXPIRED,

    /** Anything else (offline, server error, partial delete). Safe to retry. */
    FAILED
}

object DeleteAccountErrors {
    fun classify(t: Throwable): DeleteFailure = when {
        t is SessionExpiredException -> DeleteFailure.SESSION_EXPIRED
        t is HttpException && (t.code() == 401 || t.code() == 403) -> DeleteFailure.SESSION_EXPIRED
        else -> DeleteFailure.FAILED
    }
}
