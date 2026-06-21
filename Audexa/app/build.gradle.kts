plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.kreativekoala.audexa"
    compileSdk = 35

    signingConfigs {
        create("release") {
            storeFile = file("/Users/sushanthtiruvaipati/Documents/GitHub/AndroidAppKey")
            storePassword = "KashtePhale!9"
            keyAlias = "androidappkey"
            keyPassword = "KashtePhale!9"
        }
    }

    defaultConfig {
        applicationId = "com.kreativekoala.audexa"
        minSdk = 26
        targetSdk = 35
        versionCode = 36
        versionName = "12.5.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }

        // Build config fields
        buildConfigField("String", "SUPABASE_URL", "\"https://lxtuvvsrtpoqgikbpasm.supabase.co\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dHV2dnNydHBvcWdpa2JwYXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMDA5NDEsImV4cCI6MjA4MDg3Njk0MX0.-0L2P6Wutv8hlsmMBaurznr1HgWSOWukj7rZTmmkuI4\"")
        buildConfigField("String", "API_BASE_URL", "\"https://ai-radio-backend.fly.dev/api\"")
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"517355381306-o9vf858ti99540b6s21l15gj5dk3d8e2.apps.googleusercontent.com\"")
        // OAuth client for Gmail/Calendar linking - use same project as sign-in (517355381306)
        // This project has Android OAuth clients with SHA-1 fingerprints configured
        buildConfigField("String", "GOOGLE_OAUTH_CLIENT_ID", "\"517355381306-o9vf858ti99540b6s21l15gj5dk3d8e2.apps.googleusercontent.com\"")
    }

    buildTypes {
        release {
            // R8 minify silently strips reflection-loaded classes — Retrofit
            // DTOs (TopicsResponse etc.) come back empty in release builds,
            // soft-locking onboarding on the topic-selection step (Play
            // review report 2026-05-28). Same R8-stripping failure pattern
            // broke MeetingMind 1.5.7 on 2026-05-24. Keep disabled.
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Desugaring (Java 8+ API support)
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")

    // On-device Kokoro 82M TTS: ONNX Runtime + WorkManager (resumable model download)
    // Use `onnxruntime-android` ≥ 1.22.0 — earlier 1.20.x and 1.21.x ship
    // `libonnxruntime.so` 16 KB-aligned but the JNI bridge
    // `libonnxruntime4j_jni.so` is still 4 KB-aligned, which trips the
    // Play Store 16 KB page-size check on Android 15+ devices.
    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.22.0")
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // Core Android
    implementation(libs.androidx.core.ktx)
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    // Compose
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.ui)
    implementation(libs.androidx.ui.graphics)
    implementation(libs.androidx.ui.tooling.preview)
    implementation(libs.androidx.material3)
    implementation(libs.androidx.material.icons.extended)
    debugImplementation(libs.androidx.ui.tooling)
    debugImplementation(libs.androidx.ui.test.manifest)

    // Navigation
    implementation(libs.androidx.navigation.compose)

    // Hilt DI
    implementation(libs.hilt.android)
    ksp(libs.hilt.android.compiler)
    implementation(libs.hilt.navigation.compose)

    // Networking
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)

    // Serialization
    implementation(libs.kotlinx.serialization.json)

    // Coroutines
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.core)

    // Image Loading
    implementation(libs.coil.compose)

    // DataStore
    implementation(libs.androidx.datastore.preferences)

    // Media3 (ExoPlayer)
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.ui)
    implementation(libs.androidx.media3.session)

    // Supabase (using BOM for version management)
    implementation(platform("io.github.jan-tennert.supabase:bom:3.0.0"))
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.github.jan-tennert.supabase:auth-kt")
    implementation("io.github.jan-tennert.supabase:realtime-kt")

    // Ktor client for Supabase (supabase-kt 3.0 uses Ktor 3.x)
    implementation(platform("io.ktor:ktor-bom:3.0.2"))
    implementation("io.ktor:ktor-client-android")
    implementation("io.ktor:ktor-client-core")
    implementation("io.ktor:ktor-client-content-negotiation")
    implementation("io.ktor:ktor-serialization-kotlinx-json")

    // Google Sign-In
    implementation(libs.play.services.auth)

    // RevenueCat
    implementation(libs.revenuecat.purchases)
    implementation(libs.revenuecat.purchases.ui)

    // PaywallKit
    implementation(project(":paywallkit"))
    implementation(project(":crosspromokit"))

    // Testing
    testImplementation("junit:junit:4.13.2")

    // Google Sign-In (Credential Manager)
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
}
