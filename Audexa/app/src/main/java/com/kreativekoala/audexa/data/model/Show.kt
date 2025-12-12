package com.kreativekoala.audexa.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Show(
    val id: String,
    val title: String,
    val description: String = "",
    val category: String = "",
    @SerialName("image_url")
    val imageUrl: String? = null,
    @SerialName("image_color")
    val imageColor: String = "#FF6B35",
    @SerialName("episode_count")
    val episodeCount: Int = 0,
    @SerialName("is_subscribed")
    val isSubscribed: Boolean = false,
    val publisher: String? = null,
    val rating: Double? = null
)

data class Category(
    val id: String,
    val name: String,
    val icon: String,
    val color: String,
    val shows: List<Show> = emptyList()
)

@Serializable
data class DiscoverCategory(
    val title: String,
    val shows: List<Show>
)
