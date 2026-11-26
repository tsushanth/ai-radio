package com.kreativekoala.audexa.service

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class AudioPlaybackService : MediaSessionService() {

    private var mediaSession: MediaSession? = null
    private var player: ExoPlayer? = null

    @OptIn(UnstableApi::class)
    override fun onCreate() {
        super.onCreate()

        // Start playback after ~1s of buffered audio (ExoPlayer default is 2.5s) and
        // recover from rebuffers after 2s (default 5s). Shaves ~1.5s off time-to-first-audio
        // on the live stream; min/max keep the default-ish steady-state buffer.
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs = */ 15_000,
                /* maxBufferMs = */ 50_000,
                /* bufferForPlaybackMs = */ 1_000,
                /* bufferForPlaybackAfterRebufferMs = */ 2_000
            )
            .build()

        // Weak mobile networks: 20 s connect / 30 s read (ExoPlayer default is 8 s / 8 s) and more loader retries with backoff.
        // See PlaybackPolicy for the numbers and why.
        val httpFactory = DefaultHttpDataSource.Factory()
            .setConnectTimeoutMs(PlaybackPolicy.CONNECT_TIMEOUT_MS)
            .setReadTimeoutMs(PlaybackPolicy.READ_TIMEOUT_MS)
        val mediaSourceFactory = DefaultMediaSourceFactory(this)
            .setDataSourceFactory(DefaultDataSource.Factory(this, httpFactory))
            .setLoadErrorHandlingPolicy(BoundedRetryLoadErrorHandlingPolicy())

        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(mediaSourceFactory)
            .setLoadControl(loadControl)
            .setHandleAudioBecomingNoisy(true)
            .build()
        
        mediaSession = MediaSession.Builder(this, player!!)
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val result = super.onStartCommand(intent, flags, startId)
        answerIdleMediaButtonStart(this, intent, startId, player?.mediaItemCount ?: 0)
        return result
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        val player = mediaSession?.player
        if (player?.playWhenReady != true || player.mediaItemCount == 0) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        super.onDestroy()
    }

    companion object {
        private const val TAG = "AudioPlaybackService"

        /**
         * A headset or Bluetooth button, or "play" on a leftover notification, can start this service after the app
         * process was killed. The start is a foreground-service start, but the new player has nothing to play (there is
         * no playback resumption), so Media3 never calls startForeground() and Android crashes the app. Answer the start
         * with the notification Media3 would use, remove it at once and stop.
         *
         * @return true when this start was answered here.
         */
        @androidx.annotation.OptIn(UnstableApi::class)
        internal fun answerIdleMediaButtonStart(service: Service, intent: Intent?, startId: Int, mediaItemCount: Int): Boolean {
            if (intent?.action != Intent.ACTION_MEDIA_BUTTON || mediaItemCount > 0) return false
            val channelId = DefaultMediaNotificationProvider.DEFAULT_CHANNEL_ID
            NotificationManagerCompat.from(service).createNotificationChannel(
                NotificationChannelCompat.Builder(channelId, NotificationManagerCompat.IMPORTANCE_LOW)
                    .setName(service.getString(DefaultMediaNotificationProvider.DEFAULT_CHANNEL_NAME_RESOURCE_ID))
                    .build()
            )
            val notification = NotificationCompat.Builder(service, channelId)
                .setSmallIcon(androidx.media3.session.R.drawable.media3_notification_small_icon)
                .setContentTitle(service.applicationInfo.loadLabel(service.packageManager))
                .build()
            try {
                ServiceCompat.startForeground(
                    service,
                    DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID,
                    notification,
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0,
                )
                ServiceCompat.stopForeground(service, ServiceCompat.STOP_FOREGROUND_REMOVE)
            } catch (e: IllegalStateException) {
                // Android 12+ refuses a foreground start from the background; then none was owed either.
                Log.w(TAG, "Could not go foreground for an idle media button start", e)
            }
            service.stopSelf(startId)
            return true
        }
    }
}
