package com.kreativekoala.audexa

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.rememberNavController
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.service.AudioManager
import com.kreativekoala.audexa.ui.components.MiniPlayer
import com.kreativekoala.audexa.ui.navigation.AudexaNavGraph
import com.kreativekoala.audexa.ui.navigation.Screen
import com.kreativekoala.audexa.ui.theme.AudexaTheme
import com.kreativekoala.audexa.ui.theme.Background
import com.kreativekoala.audexa.ui.topic.TopicDetailScreen
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var audioManager: AudioManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            AudexaTheme {
                AudexaApp(audioManager = audioManager)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AudexaApp(
    audioManager: AudioManager,
    mainViewModel: MainViewModel = hiltViewModel()
) {
    val navController = rememberNavController()
    val uiState by mainViewModel.uiState.collectAsState()
    val audioState by audioManager.isPlaying.collectAsState()
    val currentEpisode by audioManager.currentEpisode.collectAsState()
    val currentPosition by audioManager.currentPosition.collectAsState()
    val duration by audioManager.duration.collectAsState()

    // Topic detail sheet state
    var selectedTopic by remember { mutableStateOf<Topic?>(null) }

    val startDestination = if (uiState.isLoggedIn) {
        Screen.Home.route
    } else {
        Screen.Auth.route
    }

    Scaffold(
        containerColor = Background,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            // Mini player shown when audio is available
            if (currentEpisode != null) {
                MiniPlayer(
                    episodeTitle = currentEpisode?.title ?: "",
                    showName = currentEpisode?.topicId ?: "",
                    isPlaying = audioState,
                    currentTime = currentPosition,
                    duration = duration,
                    onPlayPause = {
                        if (audioState) audioManager.pause() else audioManager.resume()
                    },
                    onTap = {
                        // Could navigate to full player or show topic detail
                    }
                )
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            AudexaNavGraph(
                navController = navController,
                startDestination = startDestination,
                onShowTopicDetail = { topic ->
                    selectedTopic = topic
                }
            )
        }
    }

    // Topic Detail Bottom Sheet
    if (selectedTopic != null) {
        ModalBottomSheet(
            onDismissRequest = { selectedTopic = null },
            containerColor = Background,
            windowInsets = WindowInsets(0)
        ) {
            TopicDetailScreen(
                topic = selectedTopic!!,
                onDismiss = { selectedTopic = null },
                onHide = {
                    mainViewModel.hideTopic(selectedTopic!!.id)
                    selectedTopic = null
                }
            )
        }
    }
}
