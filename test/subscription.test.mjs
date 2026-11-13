import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocketServer } from 'ws';

import { VocalStackError } from '../dist/errors.js';
import { CATCH_UP_FAILED, Subscription } from '../dist/subscription.js';

async function server({ ready = true } = {}) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise((r) => wss.once('listening', r));
  const socks = [];
  const closed = [];
  wss.on('connection', (ws) => {
    socks.push(ws);
    ws.on('close', () => closed.push(ws));
    if (ready) ws.send(JSON.stringify({ type: 'subscribe.ready', lastSeq: -1 }));
  });
  const say = (seq) => socks[0].send(JSON.stringify({ type: 'transcript.committed', cursor: seq, segment: { seq, text: `line ${seq}` } }));
  return {
    url: `ws://127.0.0.1:${wss.address().port}/v1/transcriptions/r/subscribe`,
    socks,
    closed,
    say,
    close: () => {
      for (const c of wss.clients) c.terminate();
      return new Promise((r) => wss.close(r));
    },
  };
}

const snapshot = (lastSeq, from = 0) => ({
  transcriptionId: 'r',
  state: 'live',
  lastSeq,
  segments: Array.from({ length: Math.max(0, lastSeq - from + 1) }, (_, i) => ({ seq: from + i, text: `line ${from + i}` })),
  sentences: [],
  speakers: [],
  spans: [],
});

const rateLimited = (afterS) =>
  new VocalStackError('rate_limited', 'too many requests', { retryable: true, status: 429, headers: new Headers({ 'retry-after': String(afterS) }) });

async function collect(sub, until) {
  const got = [];
  for await (const ev of sub) {
    got.push(ev);
    if (until?.(ev, got)) break;
  }
  return got;
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = (got) => got.flatMap((e) => (e.type === 'snapshot' ? e.snapshot.segments.map((s) => s.seq) : e.type === 'frame' ? [e.seq] : []));

test('a catch-up that fails twice is asked again and every line arrives once, in order', async () => {
  const s = await server();
  try {
    const asked = [];
    let state = 4;
    const outcomes = [() => Promise.reject(rateLimited(0.05)), () => Promise.reject(new TypeError('fetch failed'))];
    const snap = (after) => {
      asked.push(after);
      if (after === undefined) return Promise.resolve(snapshot(-1));
      const fail = outcomes.shift();
      return fail ? fail() : Promise.resolve(snapshot(state, after + 1));
    };
    const sub = await Subscription.open('r', s.url, undefined, {}, snap, { waitsMs: [20, 40], giveUpAfterMs: 5_000 });
    s.say(0);
    s.say(3);
    await tick(30);
    s.say(4);
    await tick(150);
    state = 4;
    s.say(5);
    s.say(6);
    const got = await collect(sub, (ev) => ev.type === 'frame' && ev.seq === 6);
    sub.close();
    assert.deepEqual(lines(got), [0, 1, 2, 3, 4, 5, 6], 'no line lost, none twice');
    assert.equal(asked.filter((a) => a === 0).length, 3, 'two failures, then the one that worked');
    assert.equal(got.filter((e) => e.type === 'snapshot' && e.reason === 'gap').length, 1);
    assert.equal(sub.cursor, 6);
  } finally {
    await s.close();
  }
});

test('the wait a rate limit asks for is kept before the next try', async () => {
  const s = await server();
  try {
    const at = [];
    let failed = false;
    const snap = (after) => {
      if (after === undefined) return Promise.resolve(snapshot(-1));
      at.push(Date.now());
      if (!failed) {
        failed = true;
        return Promise.reject(rateLimited(0.3));
      }
      return Promise.resolve(snapshot(2, after + 1));
    };
    const sub = await Subscription.open('r', s.url, undefined, {}, snap, { waitsMs: [10], giveUpAfterMs: 5_000 });
    s.say(2);
    await collect(sub, (ev) => ev.type === 'snapshot' && ev.reason === 'gap');
    sub.close();
    assert.ok(at[1] - at[0] >= 280, `waited ${at[1] - at[0]} ms`);
  } finally {
    await s.close();
  }
});

test('a catch-up that keeps failing ends the subscription where the consumer sees it', async () => {
  const s = await server();
  try {
    let tries = 0;
    const snap = (after) => {
      if (after === undefined) return Promise.resolve(snapshot(-1));
      tries++;
      return Promise.reject(new TypeError('fetch failed'));
    };
    const sub = await Subscription.open('r', s.url, undefined, {}, snap, { waitsMs: [20, 40, 80], giveUpAfterMs: 300 });
    s.say(5);
    for (let i = 6; i < 12; i++) s.say(i);
    const got = await collect(sub);
    assert.deepEqual(got.map((e) => e.type), ['snapshot', 'closed'], 'nothing is shown past the hole, and the end is said once');
    assert.equal(got[1].reason, CATCH_UP_FAILED);
    assert.ok(tries >= 3, `tried ${tries} times`);
    await tick(100);
    assert.equal(s.closed.length, 1, 'the socket is closed');
  } finally {
    await s.close();
  }
});

test('a refusal that will not change ends it at once', async () => {
  const s = await server();
  try {
    let tries = 0;
    const snap = (after) => {
      if (after === undefined) return Promise.resolve(snapshot(-1));
      tries++;
      return Promise.reject(new VocalStackError('forbidden', 'no access', { status: 403 }));
    };
    const sub = await Subscription.open('r', s.url, undefined, {}, snap, { waitsMs: [5_000], giveUpAfterMs: 60_000 });
    s.say(3);
    const t0 = Date.now();
    const got = await collect(sub);
    assert.equal(got.at(-1).reason, CATCH_UP_FAILED);
    assert.equal(tries, 1);
    assert.ok(Date.now() - t0 < 1_000);
  } finally {
    await s.close();
  }
});

test('lines held while catching up are bounded', async () => {
  const s = await server();
  try {
    let release;
    const snap = (after) => (after === undefined ? Promise.resolve(snapshot(-1)) : new Promise((r) => (release = r)));
    const sub = await Subscription.open('r', s.url, undefined, {}, snap, { mostHeld: 10, giveUpAfterMs: 60_000 });
    for (let i = 2; i < 40; i++) s.say(i);
    const got = await collect(sub);
    assert.deepEqual(got.map((e) => e.type), ['snapshot', 'closed']);
    assert.equal(got[1].reason, CATCH_UP_FAILED);
    release(snapshot(40, 0));
    await tick(50);
    assert.equal(sub.cursor, -1, 'a late answer changes nothing');
  } finally {
    await s.close();
  }
});

test('a first snapshot that fails closes the socket', async () => {
  const s = await server();
  try {
    await assert.rejects(Subscription.open('r', s.url, undefined, {}, () => Promise.reject(rateLimited(1))), (e) => e.code === 'rate_limited');
    await tick(100);
    assert.equal(s.closed.length, 1);
  } finally {
    await s.close();
  }
});

test('a gap found while the held lines are replayed is caught up too', async () => {
  const s = await server();
  try {
    const answers = [snapshot(3, 0), snapshot(8, 6)];
    const snap = (after) => (after === undefined ? Promise.resolve(snapshot(-1)) : tick(60).then(() => answers.shift()));
    const sub = await Subscription.open('r', s.url, undefined, {}, snap, { waitsMs: [20] });
    s.say(3);
    s.say(4);
    s.say(5);
    s.say(9);
    s.say(10);
    const got = await collect(sub, (ev) => ev.type === 'frame' && ev.seq === 10);
    sub.close();
    assert.deepEqual(lines(got), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  } finally {
    await s.close();
  }
});

test('a subscription opened from a cursor reads only what came after it, and each later line once (later item 20)', async () => {
  const s = await server();
  try {
    const asked = [];
    let top = 9;
    const snap = (after) => {
      asked.push(after);
      return Promise.resolve(after === undefined ? snapshot(top) : snapshot(top, after + 1));
    };
    const sub = await Subscription.open('r', s.url, undefined, { since: 6 }, snap, { waitsMs: [20], giveUpAfterMs: 5_000 });
    top = 11;
    assert.deepEqual(asked, [6], 'no whole transcript is read');
    assert.deepEqual(sub.snapshot.segments.map((x) => x.seq), [7, 8, 9]);
    assert.equal(sub.cursor, 9);
    s.say(9);
    s.say(10);
    s.say(12);
    const got = await collect(sub, (_ev, all) => lines(all).includes(12));
    sub.close();
    assert.equal(got[0].type, 'snapshot');
    assert.equal(got[0].reason, 'gap', 'the first snapshot is merged, not a fresh start');
    assert.deepEqual(lines(got), [7, 8, 9, 10, 11, 12], 'each line once, in order; the gap after 10 is caught up as before');
    assert.deepEqual(asked, [6, 10]);
  } finally {
    await s.close();
  }
});

test('without a cursor the first snapshot is the whole transcript, as before', async () => {
  const s = await server();
  try {
    const asked = [];
    const sub = await Subscription.open('r', s.url, undefined, {}, (after) => { asked.push(after); return Promise.resolve(snapshot(3)); });
    assert.deepEqual(asked, [undefined]);
    const got = await collect(sub, (ev) => ev.type === 'snapshot');
    sub.close();
    assert.equal(got[0].reason, 'initial');
  } finally {
    await s.close();
  }
});
