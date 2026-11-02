import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackController, IDLE, type AudioLike, type Track } from '../src/lib/playback-controller.ts';

class FakeAudio implements AudioLike {
  src: string;
  currentTime = 0;
  duration = 100;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  rejectPlay: Error | null = null;
  onplay: AudioLike['onplay'] = null;
  onpause: AudioLike['onpause'] = null;
  onended: AudioLike['onended'] = null;
  onerror: AudioLike['onerror'] = null;
  constructor(url: string) { this.src = url; }
  async play() {
    this.playCalls++;
    if (this.rejectPlay) throw this.rejectPlay;
    this.paused = false;
    this.onplay?.();
  }
  pause() { this.pauseCalls++; if (!this.paused) { this.paused = true; this.onpause?.(); } }
}

function setup() {
  const made: FakeAudio[] = [];
  const c = new PlaybackController((url) => { const a = new FakeAudio(url); made.push(a); return a; });
  const notified: number[] = [];
  c.subscribe(() => notified.push(1));
  return { c, made, notified };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

const station: Track = { kind: 'station', id: 'en', title: 'Audexa Radio', url: '/api/stream/en', live: true };
const station2: Track = { kind: 'station', id: 'es', title: 'Audexa Espanol', url: '/api/stream/es', live: true };
const brief: Track = { kind: 'brief', id: 'b1', title: 'Your Daily Brief', url: 'https://x/brief.mp3', live: false };

test('starts idle', () => {
  const { c } = setup();
  assert.equal(c.getSnapshot(), IDLE);
});

test('play() creates the element, starts it and reports playing', async () => {
  const { c, made } = setup();
  c.play(station);
  await flush();
  assert.equal(made.length, 1);
  assert.equal(made[0].src, '/api/stream/en');
  assert.equal(made[0].playCalls, 1);
  assert.deepEqual(c.getSnapshot(), { track: station, playing: true, error: null });
});

test('tapping the current track toggles pause/resume without a new element', async () => {
  const { c, made } = setup();
  c.play(brief);
  await flush();
  c.toggle();
  assert.equal(c.getSnapshot().playing, false);
  assert.equal(c.getSnapshot().track, brief);
  c.play(brief); // same track again = resume
  await flush();
  assert.equal(c.getSnapshot().playing, true);
  assert.equal(made.length, 1);
});

test('resuming a live stream reconnects to the live edge', async () => {
  const { c, made } = setup();
  c.play(station);
  await flush();
  made[0].src = 'stale-buffer';
  c.toggle(); // pause
  c.toggle(); // resume
  await flush();
  assert.equal(made[0].src, '/api/stream/en');
  assert.equal(c.getSnapshot().playing, true);
});

test('resuming a recorded track keeps its position', async () => {
  const { c, made } = setup();
  c.play(brief);
  await flush();
  made[0].currentTime = 42;
  c.toggle();
  c.toggle();
  await flush();
  assert.equal(made[0].currentTime, 42);
  assert.equal(made[0].src, 'https://x/brief.mp3');
});

test('starting another track stops the previous one, and its late events are ignored', async () => {
  const { c, made } = setup();
  c.play(station);
  await flush();
  const oldOnPause = made[0].onpause;
  c.play(brief);
  await flush();
  assert.equal(made.length, 2);
  assert.equal(made[0].pauseCalls >= 1, true);
  assert.equal(made[0].src, '');
  assert.equal(made[0].onpause, null);
  assert.equal(c.getSnapshot().track, brief);
  assert.equal(c.getSnapshot().playing, true);
  oldOnPause?.(); // a late event from the old element must not flip the new state
  assert.equal(c.getSnapshot().playing, true);
});

test('stop() pauses, releases the element and clears the track', async () => {
  const { c, made } = setup();
  c.play(station);
  await flush();
  c.stop();
  assert.equal(made[0].paused, true);
  assert.equal(made[0].src, '');
  assert.equal(c.getSnapshot().track, null);
  assert.equal(c.getSnapshot().playing, false);
  c.toggle(); // nothing to toggle: no throw, no new element
  assert.equal(made.length, 1);
});

test('dispose() (leaving the dashboard) stops the audio, silences the old element, and is idempotent', async () => {
  const { c, made } = setup();
  c.play(station);
  await flush();
  const old = made[0];
  const oldOnPlay = old.onplay;
  c.dispose();
  assert.equal(old.paused, true);
  assert.equal(old.src, '');
  assert.equal(c.getSnapshot(), IDLE);
  oldOnPlay?.(); // a late event from the released element changes nothing
  assert.equal(c.getSnapshot(), IDLE);
  c.dispose();
  assert.equal(c.getSnapshot(), IDLE);
});

test('after dispose the controller is reusable (React Strict Mode unmounts and remounts once in dev)', async () => {
  const { c, made } = setup();
  c.dispose();
  c.play(station2);
  await flush();
  assert.equal(made.length, 1);
  assert.equal(c.getSnapshot().playing, true);
});

test('a blocked/failed start clears the track and says so; an abort does not', async () => {
  const { c } = setup();
  const failing = new PlaybackController(() => { const a = new FakeAudio('x'); a.rejectPlay = Object.assign(new Error('blocked'), { name: 'NotAllowedError' }); return a; });
  failing.play(station);
  await flush();
  assert.equal(failing.getSnapshot().track, null);
  assert.match(failing.getSnapshot().error ?? '', /could not start/);

  const aborting = new PlaybackController(() => { const a = new FakeAudio('x'); a.rejectPlay = Object.assign(new Error('interrupted'), { name: 'AbortError' }); return a; });
  aborting.play(station);
  await flush();
  assert.equal(aborting.getSnapshot().track, station);
  assert.equal(aborting.getSnapshot().error, null);
  assert.ok(c);
});

test('stream error stops the playing flag and reports it; ended just stops', async () => {
  const { c, made } = setup();
  c.play(station);
  await flush();
  made[0].onerror?.();
  assert.equal(c.getSnapshot().playing, false);
  assert.match(c.getSnapshot().error ?? '', /could not be played/);
  assert.equal(c.getSnapshot().track, station);

  const s2 = setup();
  s2.c.play(brief);
  await flush();
  s2.made[0].onended?.();
  assert.equal(s2.c.getSnapshot().playing, false);
  assert.equal(s2.c.getSnapshot().track, brief); // the brief stays loaded so it can be replayed
});

test('seekBy skips within a recording, clamped, and does nothing on a live stream', async () => {
  const { c, made } = setup();
  c.play(brief);
  await flush();
  made[0].currentTime = 10;
  c.seekBy(15);
  assert.equal(made[0].currentTime, 25);
  c.seekBy(-100);
  assert.equal(made[0].currentTime, 0);
  c.seekBy(1000);
  assert.equal(made[0].currentTime, 100);

  const live = setup();
  live.c.play(station);
  await flush();
  live.made[0].currentTime = 5;
  live.c.seekBy(15);
  assert.equal(live.made[0].currentTime, 5);
});

test('updateTrack changes the shown text only when it differs', async () => {
  const { c, notified } = setup();
  c.updateTrack({ subtitle: 'ignored: nothing playing' });
  assert.equal(c.getSnapshot(), IDLE);
  c.play(station);
  await flush();
  const n = notified.length;
  c.updateTrack({ subtitle: 'Headlines' });
  assert.equal(c.getSnapshot().track?.subtitle, 'Headlines');
  c.updateTrack({ subtitle: 'Headlines' });
  assert.equal(notified.length, n + 1);
});
