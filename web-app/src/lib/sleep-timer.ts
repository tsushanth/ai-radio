// Sleep timer for the episode player: the same choices as Android (5, 10, 15, 30, 60 minutes).
// Deadline-based, not a countdown of ticks, so a throttled background tab cannot make it run long by more than one tick.

export const SLEEP_OPTIONS_MIN = [5, 10, 15, 30, 60] as const;

export interface TimerDeps {
  now: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

const realDeps: TimerDeps = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

export class SleepTimer {
  private handle: unknown = null;
  private deadline = 0;
  private deps: TimerDeps;
  private tickMs: number;

  constructor(deps: TimerDeps = realDeps, tickMs = 1000) {
    this.deps = deps;
    this.tickMs = tickMs;
  }

  get active(): boolean {
    return this.handle !== null;
  }

  /** Milliseconds left, 0 when not running. */
  remainingMs(): number {
    return this.active ? this.left() : 0;
  }

  private left(): number {
    return Math.max(0, this.deadline - this.deps.now());
  }

  /**
   * Starts (or restarts) the timer. `onTick` gets the remaining ms every tick, `onExpire` fires once when time is up.
   * Returns false, and changes nothing, for a value that is not one of the offered minutes.
   */
  start(minutes: number, onExpire: () => void, onTick?: (remainingMs: number) => void): boolean {
    if (!(SLEEP_OPTIONS_MIN as readonly number[]).includes(minutes)) return false;
    this.cancel();
    this.deadline = this.deps.now() + minutes * 60_000;
    onTick?.(this.left());
    this.handle = this.deps.setInterval(() => {
      const left = this.left();
      if (left <= 0) {
        this.cancel();
        onTick?.(0);
        onExpire();
      } else {
        onTick?.(left);
      }
    }, this.tickMs);
    return true;
  }

  cancel(): void {
    if (this.handle !== null) this.deps.clearInterval(this.handle);
    this.handle = null;
    this.deadline = 0;
  }
}

/** "4:05" / "59:59" / "1:00:00" */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
