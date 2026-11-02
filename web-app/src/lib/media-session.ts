// Browser Media Session: media keys, the OS "now playing" widget and the lock screen / notification shade on Android Chrome.
// Pure functions over an injected navigator so they can be tested; every call is a no-op where the API does not exist.

export interface SessionTrack {
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
}

export interface SessionHandlers {
  play?: () => void;
  pause?: () => void;
  stop?: () => void;
  seekBackward?: () => void;
  seekForward?: () => void;
}

interface MediaSessionLike {
  metadata: unknown;
  playbackState: string;
  setActionHandler(action: string, handler: (() => void) | null): void;
}
type NavigatorLike = { mediaSession?: MediaSessionLike } | undefined | null;
type MetadataCtor = (new (init: Record<string, unknown>) => unknown) | undefined;

const ACTIONS: [keyof SessionHandlers, string][] = [
  ['play', 'play'],
  ['pause', 'pause'],
  ['stop', 'stop'],
  ['seekBackward', 'seekbackward'],
  ['seekForward', 'seekforward'],
];

/**
 * Publishes the track and wires the handlers. Returns a cleanup that removes exactly what this call set (handlers, metadata),
 * so the next owner starts clean. Browsers that reject an action (older Safari) are skipped silently.
 */
export function bindMediaSession(
  nav: NavigatorLike,
  track: SessionTrack,
  handlers: SessionHandlers,
  Metadata: MetadataCtor,
  playing: boolean
): () => void {
  const ms = nav?.mediaSession;
  if (!ms) return () => {};
  if (Metadata) {
    try {
      ms.metadata = new Metadata({
        title: track.title,
        artist: track.artist ?? 'Audexa',
        album: track.album ?? 'Audexa',
        artwork: track.artworkUrl ? [{ src: track.artworkUrl }] : [],
      });
    } catch {
      // metadata is optional
    }
  }
  const set: string[] = [];
  for (const [key, action] of ACTIONS) {
    const fn = handlers[key];
    if (!fn) continue;
    try {
      ms.setActionHandler(action, fn);
      set.push(action);
    } catch {
      // action not supported here
    }
  }
  ms.playbackState = playing ? 'playing' : 'paused';
  return () => {
    for (const action of set) {
      try {
        ms.setActionHandler(action, null);
      } catch {
        // ignore
      }
    }
    ms.metadata = null;
    ms.playbackState = 'none';
  };
}
