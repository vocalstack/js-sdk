// `npm test` (after `npm run build`): a realtime session through the relay's
// restart close (1012), against a fake stream server.  No network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocketServer } from 'ws';

import { RealtimeSession, RESTART_CLOSE } from '../dist/realtime.js';

/** A stream server: each connection says ready; `script[i]` decides what
 *  connection i does after `afterBytes` of audio: close with a code, or
 *  (when absent) commit one segment on `eof` and say done. */
async function server(script) {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise((r) => wss.once('listening', r));
  const conns = [];
  wss.on('connection', (ws) => {
    const i = conns.length;
    const c = { bytes: 0, texts: [] };
    conns.push(c);
    ws.send(JSON.stringify({ type: 'session.ready', sessionId: 's' }));
    const step = script[i];
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        c.bytes += data.length;
        if (step && c.bytes >= step.afterBytes) ws.close(step.close, 'the relay is restarting; reconnect');
        return;
      }
      const f = JSON.parse(data.toString());
      c.texts.push(f.type);
      if (f.type === 'eof' && !step) {
        ws.send(JSON.stringify({ type: 'transcript.committed', segment: { seq: 0, speaker: 0, start: 0, end: 1, wallStart: 0, text: 'carried on', words: [] } }));
        ws.send(JSON.stringify({ type: 'session.done', reason: 'eof', stats: { audioS: 1, processingS: 0.5, realtimeFactor: 2 } }));
      }
    });
  });
  const url = `ws://127.0.0.1:${wss.address().port}/v1/realtime/sessions/tok/socket`;
  return { url, conns, close: () => { for (const c of wss.clients) c.terminate(); return new Promise((r) => wss.close(r)); } };
}

async function drain(session) {
  const got = [];
  let err = null;
  try {
    for await (const e of session) got.push(e);
  } catch (e) {
    err = e;
  }
  return { got, err };
}

test('a restart close (1012) reconnects to the same streamUrl and the session goes on', async () => {
  const s = await server([{ afterBytes: 3200, close: RESTART_CLOSE }]);
  try {
    const session = await RealtimeSession.connect({ sessionId: 's', streamUrl: s.url });
    const done = drain(session);
    session.sendAudio(new Uint8Array(3200));
    await new Promise((r) => setTimeout(r, 200));
    // Sent while it reconnects: kept, and sent on the next socket.
    session.sendAudio(new Uint8Array(1600));
    session.sendClock(16000, 1);
    session.eof();
    const { got, err } = await done;
    assert.equal(err, null, `no error: ${err?.message}`);
    assert.equal(s.conns.length, 2, 'one reconnect');
    assert.equal(s.conns[1].bytes, 1600, 'the audio sent meanwhile reached the next socket');
    assert.deepEqual(s.conns[1].texts, ['clock', 'eof'], 'and the frames, in order');
    assert.deepEqual(got.map((e) => e.type), ['transcript.committed']);
    assert.equal(session.doneReason, 'eof');
  } finally {
    await s.close();
  }
});

test('restart closes past the tries end the session as engine_lost', async () => {
  const again = { afterBytes: 1, close: RESTART_CLOSE };
  const s = await server([again, again, again, again]);
  try {
    const session = await RealtimeSession.connect({ sessionId: 's', streamUrl: s.url, readyDeadlineMs: 2000 });
    const done = drain(session);
    const feeder = setInterval(() => session.sendAudio(new Uint8Array(64)), 50);
    const { err } = await done;
    clearInterval(feeder);
    assert.equal(err?.code, 'engine_lost');
    assert.match(err.message, /1012/);
    assert.equal(s.conns.length, 4, 'the first socket and three reconnects');
  } finally {
    await s.close();
  }
});

test('any other close is engine_lost at once, no reconnect', async () => {
  const s = await server([{ afterBytes: 1, close: 1011 }]);
  try {
    const session = await RealtimeSession.connect({ sessionId: 's', streamUrl: s.url });
    const done = drain(session);
    session.sendAudio(new Uint8Array(64));
    const { err } = await done;
    assert.equal(err?.code, 'engine_lost');
    assert.equal(s.conns.length, 1);
  } finally {
    await s.close();
  }
});
