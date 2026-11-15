package com.kreativekoala.audexa.di

import android.content.Context
import com.kreativekoala.audexa.BuildConfig
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideAppLocaleStore(): com.kreativekoala.audexa.util.AppLocaleStore =
        com.kreativekoala.audexa.util.AppCompatLocaleStore()

    @Provides
    @Singleton
    fun provideUiLanguageOfferStore(
        preferences: com.kreativekoala.audexa.data.local.PreferencesManager
    ): com.kreativekoala.audexa.util.UiLanguageOfferStore =
        com.kreativekoala.audexa.util.PreferencesUiLanguageOfferStore(preferences)

    @Provides
    @Singleton
    fun provideSupabaseClient(): SupabaseClient {
        return createSupabaseClient(
            supabaseUrl = BuildConfig.SUPABASE_URL,
            supabaseKey = BuildConfig.SUPABASE_ANON_KEY
        ) {
            install(Auth)
            install(Postgrest)
            install(Realtime)
        }
    }
}
