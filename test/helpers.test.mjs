// `npm test` (after `npm run build`): the helpers the reference's guides
// lean on — `vs.jobs.wait`'s onProgress and a realtime socket's onFrame —
// against a fake fetch and a local WebSocket server.  No network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocketServer } from 'ws';

import { RealtimeSession, VocalStack } from '../dist/index.js';

test('jobs.wait hands every job read to onProgress, the last one included', async () => {
  const states = [
    { state: 'queued', progress: { pct: 0 } },
    { state: 'transcribing', progress: { pct: 40 } },
    { state: 'done', progress: { pct: 100 } },
  ];
  let n = 0;
  const fetch = async () => new Response(JSON.stringify({ recordingId: 'r1', ...states[Math.min(n++, states.length - 1)] }), { status: 200 });
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch });
  const seen = [];
  const job = await vs.jobs.wait('r1', { intervalMs: 1, onProgress: (j) => seen.push(`${j.state}:${j.progress.pct}`) });
  assert.equal(job.state, 'done');
  assert.deepEqual(seen, ['queued:0', 'transcribing:40', 'done:100']);
});

test('a realtime session hands every frame to onFrame, lifecycle frames included', async () => {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.once('listening', r));
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'session.loading', stage: 'model' }));
    ws.send(JSON.stringify({ type: 'session.ready', sessionId: 's1' }));
    ws.on('message', (m, binary) => {
      if (binary || JSON.parse(String(m)).type !== 'eof') return;
      ws.send(JSON.stringify({ type: 'transcript.draft', segments: [{ start: 0, text: 'hel', speaker: 0, tentative: true }] }));
      ws.send(JSON.stringify({ type: 'transcript.committed', segment: { seq: 0, start: 0, end: 1, text: 'hello', speaker: 0, words: [] } }));
      ws.send(JSON.stringify({ type: 'session.done', reason: 'eof', stats: { audioS: 1, processingS: 0.5, realtimeFactor: 2 } }));
      ws.close();
    });
  });
  try {
    const frames = [];
    const url = `ws://127.0.0.1:${wss.address().port}/v1/realtime/sessions/t/socket`;
    const session = await RealtimeSession.connect({ sessionId: 's1', streamUrl: url, onFrame: (f) => frames.push(f.type) });
    assert.deepEqual(frames, ['session.loading', 'session.ready']);
    session.eof();
    const events = [];
    for await (const ev of session) events.push(ev.type);
    assert.deepEqual(events, ['transcript.draft', 'transcript.committed']);
    assert.deepEqual(frames, ['session.loading', 'session.ready', 'transcript.draft', 'transcript.committed', 'session.done']);
    assert.equal(session.doneReason, 'eof');
  } finally {
    wss.close();
  }
});

test('a realtime socket that closes with no session.done is an engine_lost error, not a quiet end', async () => {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.once('listening', r));
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'session.ready', sessionId: 's1' }));
    ws.send(JSON.stringify({ type: 'transcript.committed', segment: { seq: 0, start: 0, end: 1, text: 'before the loss', speaker: 0, words: [] } }));
    // The engine's machine is gone: the connection just ends.
    setTimeout(() => ws.terminate(), 20);
  });
  try {
    const url = `ws://127.0.0.1:${wss.address().port}/v1/realtime/sessions/t/socket`;
    const session = await RealtimeSession.connect({ sessionId: 's1', streamUrl: url });
    const events = [];
    await assert.rejects(
      (async () => {
        for await (const ev of session) events.push(ev.type);
      })(),
      (e) => e.code === 'engine_lost' && e.retryable === true,
    );
    assert.deepEqual(events, ['transcript.committed'], 'what came before the loss is still read');
    assert.equal(session.doneReason, null);
  } finally {
    wss.close();
  }
});

test('a realtime socket closed by close() ends quietly', async () => {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.once('listening', r));
  wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'session.ready', sessionId: 's1' })));
  try {
    const url = `ws://127.0.0.1:${wss.address().port}/v1/realtime/sessions/t/socket`;
    const session = await RealtimeSession.connect({ sessionId: 's1', streamUrl: url });
    setTimeout(() => session.close(), 20);
    const events = [];
    for await (const ev of session) events.push(ev.type);
    assert.deepEqual(events, []);
  } finally {
    wss.close();
  }
});
