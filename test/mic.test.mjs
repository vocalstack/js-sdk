import assert from 'node:assert/strict';
import { test } from 'node:test';

import { captureMicrophone } from '../dist/mic.js';

function fakeBrowser() {
  const world = { failAt: null, streams: [], contexts: [], sources: [], nodes: [], error: new Error('audio setup refused') };
  class Track {
    constructor() {
      this.stopped = false;
      this.listeners = {};
      this.label = 'fake mic';
    }
    stop() {
      this.stopped = true;
    }
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    }
    getSettings() {
      return {};
    }
    fire(type) {
      for (const fn of this.listeners[type] ?? []) fn();
    }
  }
  class Stream {
    constructor() {
      this.tracks = [new Track()];
    }
    getTracks() {
      return this.tracks;
    }
    getAudioTracks() {
      return this.tracks;
    }
  }
  class AudioContext {
    constructor(opts) {
      this.sampleRate = opts?.sampleRate ?? 48000;
      this.state = 'running';
      this.closed = false;
      world.contexts.push(this);
      this.audioWorklet = {
        addModule: async () => {
          if (world.failAt === 'addModule') throw world.error;
        },
      };
    }
    createMediaStreamSource(media) {
      if (world.failAt === 'source') throw world.error;
      const s = {
        media,
        connected: false,
        connect() {
          this.connected = true;
        },
        disconnect() {
          this.connected = false;
        },
      };
      world.sources.push(s);
      return s;
    }
    addEventListener() {}
    resume() {
      return Promise.resolve();
    }
    close() {
      this.closed = true;
      this.state = 'closed';
      return Promise.resolve();
    }
  }
  class AudioWorkletNode {
    constructor() {
      if (world.failAt === 'node') throw world.error;
      this.port = { onmessage: null };
      this.connected = true;
      world.nodes.push(this);
    }
    disconnect() {
      this.connected = false;
    }
  }
  const navigator = {
    mediaDevices: {
      getUserMedia: async () => {
        const s = new Stream();
        world.streams.push(s);
        return s;
      },
    },
  };
  const saved = {};
  for (const [k, v] of Object.entries({ navigator, AudioContext, AudioWorkletNode })) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  world.restore = () => {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  };
  world.live = () => world.streams.flatMap((s) => s.tracks).filter((t) => !t.stopped).length;
  world.open = () => world.contexts.filter((c) => !c.closed).length;
  return world;
}

for (const step of ['addModule', 'node', 'source']) {
  test(`a microphone setup that fails at ${step} after permission gives the microphone back and says why`, async () => {
    const w = fakeBrowser();
    try {
      w.failAt = step;
      await assert.rejects(captureMicrophone(() => {}), (e) => e === w.error);
      assert.equal(w.streams.length, 1, 'permission was asked once');
      assert.equal(w.live(), 0, 'no track of the microphone is left running');
      assert.equal(w.open(), 0, 'the audio context is closed');
      assert.ok(w.sources.every((s) => !s.connected) && w.nodes.every((n) => !n.connected), 'nothing is left connected');
    } finally {
      w.restore();
    }
  });
}

test('a microphone that started and is stopped leaves nothing running', async () => {
  const w = fakeBrowser();
  try {
    const mic = await captureMicrophone(() => {});
    assert.equal(w.live(), 1);
    assert.equal(w.open(), 1);
    await mic.stop();
    assert.equal(w.live(), 0);
    assert.equal(w.open(), 0);
  } finally {
    w.restore();
  }
});

test('a microphone taken again after its track ended is given back when it cannot be connected', async () => {
  const w = fakeBrowser();
  try {
    const mic = await captureMicrophone(() => {});
    w.failAt = 'source';
    w.streams[0].tracks[0].fire('ended');
    await new Promise((r) => setTimeout(r, 1200));
    assert.ok(w.streams.length >= 2, 'the microphone was asked for again');
    for (const s of w.streams.slice(1)) assert.ok(s.tracks.every((t) => t.stopped), 'a stream that could not be connected is stopped at once');
    await mic.stop();
    assert.equal(w.live(), 0);
    assert.equal(w.open(), 0);
  } finally {
    w.restore();
  }
});
