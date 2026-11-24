package com.kreativekoala.audexa.util

import android.content.res.Resources
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.ConfigurationCompat
import com.kreativekoala.audexa.data.model.TextLanguage

/** Android side of [TextLanguage]: reads the app language and the phone language. Safe to call from services and view models. */
object TextLanguageSource {
    fun forRequest(contentCode: String?): String {
        val app = runCatching { AppCompatDelegate.getApplicationLocales().takeIf { !it.isEmpty }?.get(0)?.toLanguageTag() }.getOrNull()
        val device = runCatching { ConfigurationCompat.getLocales(Resources.getSystem().configuration)[0]?.toLanguageTag() }.getOrNull()
        return TextLanguage.forRequest(contentCode, app, device)
    }
}
