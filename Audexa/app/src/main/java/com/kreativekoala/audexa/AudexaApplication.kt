package com.kreativekoala.audexa

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class AudexaApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        // Initialize any app-wide configurations here
    }
}
