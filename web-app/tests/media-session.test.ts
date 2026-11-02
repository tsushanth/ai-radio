import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMediaSession } from '../src/lib/media-session.ts';

class FakeMetadata {
  init: Record<string, unknown>;
  constructor(init: Record<string, unknown>) { this.init = init; }
}

function fakeNav(unsupported: string[] = []) {
  const handlers = new Map<string, unknown>();
  const ms = {
    metadata: null as unknown,
    playbackState: 'none',
    setActionHandler(action: string, fn: unknown) {
      if (unsupported.includes(action)) throw new TypeError('unsupported');
      if (fn === null) handlers.delete(action); else handlers.set(action, fn);
    },
  };
  return { nav: { mediaSession: ms }, ms, handlers };
}
const noop = () => {};

test('publishes metadata, handlers and state', () => {
  const { nav, ms, handlers } = fakeNav();
  bindMediaSession(nav, { title: 'Audexa Radio', artist: 'Live' }, { play: noop, pause: noop, seekBackward: noop, seekForward: noop }, FakeMetadata, true);
  assert.deepEqual((ms.metadata as FakeMetadata).init, { title: 'Audexa Radio', artist: 'Live', album: 'Audexa', artwork: [] });
  assert.deepEqual([...handlers.keys()].sort(), ['pause', 'play', 'seekbackward', 'seekforward']);
  assert.equal(ms.playbackState, 'playing');
});

test('a live stream binds no seek handlers; paused state is reported', () => {
  const { nav, ms, handlers } = fakeNav();
  bindMediaSession(nav, { title: 'x' }, { play: noop, pause: noop, stop: noop }, FakeMetadata, false);
  assert.deepEqual([...handlers.keys()].sort(), ['pause', 'play', 'stop']);
  assert.equal(ms.playbackState, 'paused');
});

test('cleanup removes exactly what was set and clears metadata', () => {
  const { nav, ms, handlers } = fakeNav();
  const cleanup = bindMediaSession(nav, { title: 'x' }, { play: noop, pause: noop }, FakeMetadata, true);
  cleanup();
  assert.equal(handlers.size, 0);
  assert.equal(ms.metadata, null);
  assert.equal(ms.playbackState, 'none');
});

test('actions the browser rejects are skipped without throwing', () => {
  const { nav, handlers } = fakeNav(['seekbackward', 'stop']);
  const cleanup = bindMediaSession(nav, { title: 'x' }, { play: noop, stop: noop, seekBackward: noop, seekForward: noop }, FakeMetadata, true);
  assert.deepEqual([...handlers.keys()].sort(), ['play', 'seekforward']);
  cleanup();
  assert.equal(handlers.size, 0);
});

test('no mediaSession / no navigator / no MediaMetadata are no-ops', () => {
  assert.doesNotThrow(() => bindMediaSession(undefined, { title: 'x' }, { play: noop }, FakeMetadata, true)());
  assert.doesNotThrow(() => bindMediaSession({}, { title: 'x' }, { play: noop }, FakeMetadata, true)());
  const { nav, ms, handlers } = fakeNav();
  bindMediaSession(nav, { title: 'x' }, { play: noop }, undefined, true);
  assert.equal(ms.metadata, null);
  assert.equal(handlers.size, 1);
});
