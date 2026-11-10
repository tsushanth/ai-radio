package com.kreativekoala.audexa

import com.kreativekoala.audexa.data.repository.DeleteAccountErrors
import com.kreativekoala.audexa.data.repository.DeleteFailure
import com.kreativekoala.audexa.data.repository.SessionExpiredException
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.io.IOException

class DeleteAccountErrorsTest {
    private fun http(code: Int) =
        HttpException(Response.error<Any>(code, "{}".toResponseBody("application/json".toMediaType())))

    @Test fun missingSessionMeansSignInAgain() {
        assertEquals(DeleteFailure.SESSION_EXPIRED, DeleteAccountErrors.classify(SessionExpiredException()))
    }

    @Test fun serverRefusingTheTokenMeansSignInAgain() {
        assertEquals(DeleteFailure.SESSION_EXPIRED, DeleteAccountErrors.classify(http(401)))
        assertEquals(DeleteFailure.SESSION_EXPIRED, DeleteAccountErrors.classify(http(403)))
    }

    @Test fun otherFailuresAreRetryable() {
        assertEquals(DeleteFailure.FAILED, DeleteAccountErrors.classify(http(500)))
        assertEquals(DeleteFailure.FAILED, DeleteAccountErrors.classify(http(404)))
        assertEquals(DeleteFailure.FAILED, DeleteAccountErrors.classify(IOException("offline")))
        assertEquals(DeleteFailure.FAILED, DeleteAccountErrors.classify(IllegalStateException("Server did not confirm the deletion")))
    }
}
