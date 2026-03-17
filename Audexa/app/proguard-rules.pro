# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep line number information for debugging
-keepattributes SourceFile,LineNumberTable

# Hide original source file name
-renamesourcefileattribute SourceFile

# Keep data classes for serialization
-keepclassmembers class com.kreativekoala.audexa.data.model.** {
    *;
}

# Keep API request/response classes
-keepclassmembers class com.kreativekoala.audexa.data.remote.** {
    *;
}

# Keep Retrofit interfaces
-keep,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers @kotlinx.serialization.Serializable class ** {
    static **$* INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep `@Serializable` annotations
-if @kotlinx.serialization.Serializable class **
-keepclassmembers class <1> {
    static <1>$Companion Companion;
}

-if @kotlinx.serialization.Serializable class ** {
    static **$* INSTANCE;
}
-keepclassmembers class <1>$<3> {
    kotlinx.serialization.KSerializer serializer(...);
}

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }

# Retrofit
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }

# Supabase
-keep class io.github.jan.supabase.** { *; }
-dontwarn io.github.jan.supabase.**

# Ktor
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**

# Hilt
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.lifecycle.HiltViewModelFactory

# ExoPlayer / Media3
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# SLF4J
-dontwarn org.slf4j.**

# RevenueCat
-dontwarn com.emergetools.snapshots.annotations.IgnoreEmergeSnapshot
