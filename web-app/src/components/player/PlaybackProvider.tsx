'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { IDLE, PlaybackController, type AudioLike, type PlaybackState, type Track } from '@/lib/playback-controller';
import { bindMediaSession } from '@/lib/media-session';

interface PlaybackApi extends PlaybackState {
  play: (track: Track) => void;
  toggle: () => void;
  pause: () => void;
  stop: () => void;
  seekBy: (seconds: number) => void;
  updateTrack: (patch: Partial<Pick<Track, 'title' | 'subtitle'>>) => void;
}

const PlaybackContext = createContext<PlaybackApi | null>(null);

/** Mounted once in the dashboard layout, so the station / daily brief survives route changes and is stopped when the dashboard unmounts. */
export function PlaybackProvider({ children }: { children: ReactNode }) {
  // `new Audio` only runs inside play(), i.e. in the browser, never during server rendering
  const [controller] = useState(() => new PlaybackController((url) => new Audio(url) as unknown as AudioLike));

  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => IDLE);

  // Leaving the dashboard (sign out, navigating to a public page) must not leave audio running with no controls.
  useEffect(() => () => controller.dispose(), [controller]);

  // OS media keys / now-playing widget
  const { track, playing } = state;
  useEffect(() => {
    if (!track) return;
    return bindMediaSession(
      typeof navigator === 'undefined' ? undefined : (navigator as unknown as Parameters<typeof bindMediaSession>[0]),
      { title: track.title, artist: track.subtitle ?? (track.kind === 'station' ? 'Audexa Radio' : 'Audexa') },
      {
        play: () => controller.toggle(),
        pause: () => controller.pause(),
        stop: () => controller.stop(),
        ...(track.live ? {} : { seekBackward: () => controller.seekBy(-15), seekForward: () => controller.seekBy(15) }),
      },
      typeof MediaMetadata === 'undefined' ? undefined : (MediaMetadata as unknown as new (init: Record<string, unknown>) => unknown),
      playing
    );
  }, [controller, track, playing]);

  const play = useCallback((t: Track) => controller.play(t), [controller]);
  const toggle = useCallback(() => controller.toggle(), [controller]);
  const pause = useCallback(() => controller.pause(), [controller]);
  const stop = useCallback(() => controller.stop(), [controller]);
  const seekBy = useCallback((s: number) => controller.seekBy(s), [controller]);
  const updateTrack = useCallback((p: Partial<Pick<Track, 'title' | 'subtitle'>>) => controller.updateTrack(p), [controller]);

  const value = useMemo<PlaybackApi>(
    () => ({ ...state, play, toggle, pause, stop, seekBy, updateTrack }),
    [state, play, toggle, pause, stop, seekBy, updateTrack]
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

/** Throws outside the dashboard layout. */
export function usePlayback(): PlaybackApi {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error('usePlayback must be used within PlaybackProvider');
  return ctx;
}

/** For components that can also render outside the provider (the episode AudioPlayer). */
export function useOptionalPlayback(): PlaybackApi | null {
  return useContext(PlaybackContext);
}
