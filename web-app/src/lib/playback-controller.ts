// One audio channel for the whole dashboard: the live station stream or today's daily brief. Starting one stops the other, and
// leaving the dashboard stops whatever is playing (before this, the stream was a bare `new Audio()` owned by the Home page, so
// navigating to a topic left it playing with no stop control).
//
// No React and no DOM globals in here: the audio element is injected, so the logic is testable with plain `node --test`.
// The React side (components/player/PlaybackProvider.tsx) is a thin wrapper that subscribes to this.

export type PlaybackKind = 'station' | 'brief';

export interface Track {
  kind: PlaybackKind;
  id: string;
  title: string;
  subtitle?: string;
  url: string;
  /** A live stream: no seeking, and resuming reconnects instead of replaying stale buffer. */
  live: boolean;
  /** Emoji/letter shown on the mini bar. */
  icon?: string;
}

export interface PlaybackState {
  track: Track | null;
  playing: boolean;
  error: string | null;
}

/** The slice of HTMLAudioElement the controller uses. */
export interface AudioLike {
  src: string;
  currentTime: number;
  duration: number;
  play(): Promise<void>;
  pause(): void;
  onplay: ((ev?: unknown) => void) | null;
  onpause: ((ev?: unknown) => void) | null;
  onended: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
}

export const IDLE: PlaybackState = Object.freeze({ track: null, playing: false, error: null });

const sameTrack = (a: Track, b: Track) => a.kind === b.kind && a.id === b.id && a.url === b.url;

export class PlaybackController {
  private audio: AudioLike | null = null;
  private state: PlaybackState = IDLE;
  private listeners = new Set<() => void>();
  private createAudio: (url: string) => AudioLike;

  constructor(createAudio: (url: string) => AudioLike) {
    this.createAudio = createAudio;
  }

  // --- external store (useSyncExternalStore) ---
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): PlaybackState => this.state;

  private set(next: Partial<PlaybackState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }

  /** Detach and release the current element so a late event from it cannot change state, and the connection is freed. */
  private release() {
    const a = this.audio;
    this.audio = null;
    if (!a) return;
    a.onplay = a.onpause = a.onended = a.onerror = null;
    try {
      a.pause();
      a.src = '';
    } catch {
      // already torn down
    }
  }

  /** Start a track, or resume it if it is the current one. Any other track is stopped first. */
  play(track: Track): void {
    const current = this.state.track;
    if (current && this.audio && sameTrack(current, track)) {
      this.resume();
      return;
    }
    this.release();
    const audio = this.createAudio(track.url);
    this.audio = audio;
    audio.onplay = () => { if (this.audio === audio) this.set({ playing: true, error: null }); };
    audio.onpause = () => { if (this.audio === audio) this.set({ playing: false }); };
    audio.onended = () => { if (this.audio === audio) this.set({ playing: false }); };
    audio.onerror = () => { if (this.audio === audio) this.set({ playing: false, error: 'This audio could not be played.' }); };
    this.set({ track, playing: false, error: null });
    this.start(audio);
  }

  private start(audio: AudioLike) {
    audio.play().catch((err: unknown) => {
      // A pause/seek/src change while play() was pending rejects with AbortError: not a failure
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
      // autoplay blocked, offline, or the element was replaced meanwhile
      if (this.audio === audio) {
        this.release();
        this.set({ track: null, playing: false, error: 'Playback could not start. Tap play to try again.' });
      }
    });
  }

  private resume() {
    const audio = this.audio;
    const track = this.state.track;
    if (!audio || !track) return;
    if (track.live) audio.src = track.url; // reconnect to the live edge
    this.set({ error: null });
    this.start(audio);
  }

  pause(): void {
    this.audio?.pause();
  }

  /** Pause when playing, resume when paused. */
  toggle(): void {
    if (!this.audio || !this.state.track) return;
    if (this.state.playing) this.audio.pause();
    else this.resume();
  }

  /** Stop and forget the track (mini bar closes). */
  stop(): void {
    this.release();
    if (this.state !== IDLE) this.set({ track: null, playing: false, error: null });
  }

  /** Skip within a recorded track (not live). Clamped to the start/end. */
  seekBy(seconds: number): void {
    const a = this.audio;
    if (!a || !this.state.track || this.state.track.live) return;
    const end = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Infinity;
    a.currentTime = Math.max(0, Math.min(a.currentTime + seconds, end));
  }

  /** Update the text shown for the current track (e.g. the live station's now-playing line). */
  updateTrack(patch: Partial<Pick<Track, 'title' | 'subtitle'>>): void {
    const t = this.state.track;
    if (!t) return;
    if ((patch.title === undefined || patch.title === t.title) && (patch.subtitle === undefined || patch.subtitle === t.subtitle)) return;
    this.set({ track: { ...t, ...patch } });
  }

  /**
   * Called when the provider unmounts (leaving the dashboard, signing out): stop everything. Safe to call twice, and the
   * controller stays usable (React Strict Mode runs unmount/mount once in development).
   */
  dispose(): void {
    this.release();
    this.state = IDLE;
    this.listeners.forEach((l) => l());
  }
}
