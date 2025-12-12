package com.kreativekoala.audexa.data.repository

import com.kreativekoala.audexa.data.model.*
import com.kreativekoala.audexa.data.remote.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class UserRepository @Inject constructor(
    private val apiService: ApiService
) {
    suspend fun getUser(userId: String): Result<User> = runCatching {
        apiService.getUser(userId)
    }

    suspend fun updatePreferences(userId: String, preferences: UserPreferences): Result<User> = runCatching {
        apiService.updatePreferences(userId, preferences)
    }

    suspend fun deleteUser(userId: String): Result<DeleteResponse> = runCatching {
        apiService.deleteUser(userId)
    }

    suspend fun linkAccount(
        userId: String,
        provider: String,
        email: String,
        accessToken: String,
        refreshToken: String
    ): Result<LinkAccountResponse> = runCatching {
        apiService.linkAccount(
            userId,
            LinkAccountRequest(
                provider = provider,
                email = email,
                accessToken = accessToken,
                refreshToken = refreshToken,
                emailEnabled = true,
                calendarEnabled = false
            )
        )
    }

    suspend fun unlinkAccount(userId: String, accountId: String): Result<DeleteResponse> = runCatching {
        apiService.unlinkAccount(userId, accountId)
    }

    suspend fun getLinkedAccounts(userId: String): Result<LinkedAccountsResponse> = runCatching {
        apiService.getLinkedAccounts(userId)
    }
}
