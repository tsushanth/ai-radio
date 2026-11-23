package com.kreativekoala.audexa.util

import androidx.annotation.StringRes
import com.kreativekoala.audexa.R

/**
 * Fallback names for the topic categories, used only when the server's localized category list is not available (offline, or an
 * older cached response). The normal source is the `categories` array of GET /topics?lang=, which is in the listening language
 * and so matches the topic names in the same row of chips.
 */
object CategoryTitles {
    @StringRes
    fun resFor(categoryId: String): Int? = when (categoryId) {
        "news" -> R.string.category_news
        "technology" -> R.string.category_technology
        "business" -> R.string.category_business
        "science" -> R.string.category_science
        "lifestyle" -> R.string.category_lifestyle
        "entertainment" -> R.string.category_entertainment
        "sports" -> R.string.category_sports
        else -> null
    }
}
