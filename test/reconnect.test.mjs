import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { WebSocketServer } from 'ws';

import { LOST_WAITS_MS, RealtimeSession, RESTART_CLOSE } from '../dist/realtime.js';

async function server(script) {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
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

test('sockets that stayed up start the tries anew: a long session goes through any number of restarts', async (t) => {
  const again = { afterBytes: 1, close: RESTART_CLOSE };
  const s = await server([again, again, again, again, again]);
  t.mock.timers.enable({ apis: ['Date'] });
  const attached = async (n) => {
    while (s.conns.length < n) await new Promise((r) => setTimeout(r, 20));
    await new Promise((r) => setTimeout(r, 150));
  };
  try {
    const session = await RealtimeSession.connect({ sessionId: 's', streamUrl: s.url, readyDeadlineMs: 2000 });
    const done = drain(session);
    for (let i = 1; i <= 5; i++) {
      await attached(i);
      t.mock.timers.tick(31_000);
      session.sendAudio(new Uint8Array(64));
    }
    await attached(6);
    session.eof();
    const { err } = await done;
    assert.equal(err, null, `five restart closes, each after a steady socket, and no error: ${err?.message}`);
    assert.equal(s.conns.length, 6);
    assert.equal(session.doneReason, 'eof');
  } finally {
    await s.close();
  }
});

test('a reconnect the server refuses for good ends the session with that error, with no further tries', async () => {
  const http = createServer();
  const wss = new WebSocketServer({ noServer: true });
  let upgrades = 0;
  http.on('upgrade', (req, socket, head) => {
    upgrades++;
    if (upgrades > 1) {
      const body = JSON.stringify({ code: 'session_expired', message: 'session token connect-by deadline has passed', data: { retryable: false } });
      socket.end(`HTTP/1.1 410 Gone\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.send(JSON.stringify({ type: 'session.ready', sessionId: 's' }));
      ws.on('message', () => ws.close(RESTART_CLOSE, 'the relay is restarting; reconnect'));
    });
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  try {
    const session = await RealtimeSession.connect({ sessionId: 's', streamUrl: `ws://127.0.0.1:${http.address().port}/v1/realtime/sessions/tok/socket` });
    const done = drain(session);
    session.sendAudio(new Uint8Array(64));
    const { err } = await done;
    assert.equal(err?.code, 'session_expired');
    assert.equal(err.retryable, false);
    assert.equal(upgrades, 2, 'one reconnect, refused, and no more');
  } finally {
    for (const c of wss.clients) c.terminate();
    await new Promise((r) => http.close(r));
  }
});

async function lostServer(answers) {
  const http = createServer();
  const wss = new WebSocketServer({ noServer: true });
  const seen = { upgrades: 0, bytes: [] };
  http.on('upgrade', (req, socket, head) => {
    const n = seen.upgrades++;
    const answer = n === 0 ? 'drop' : (answers[n - 1] ?? 'serve');
    if (answer === 'again' || answer === 'gone') {
      const again = answer === 'again';
      const body = JSON.stringify(
        again
          ? { code: 'engine_unavailable', message: 'The connection to this session was lost and is being restored. Try again in a moment.', data: { retryable: true } }
          : { code: 'session_expired', message: 'session token connect-by deadline has passed', data: { retryable: false } },
      );
      const head = again ? 'HTTP/1.1 503 Service Unavailable\r\nRetry-After: 5' : 'HTTP/1.1 410 Gone';
      socket.end(`${head}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
      return;
    }
    if (answer === 'silent') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      seen.bytes[n] = 0;
      ws.send(JSON.stringify({ type: 'session.ready', sessionId: 's' }));
      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          seen.bytes[n] += data.length;
          if (answer === 'drop') ws.terminate();
          return;
        }
        if (JSON.parse(data.toString()).type === 'eof') ws.send(JSON.stringify({ type: 'session.done', reason: 'eof', stats: { audioS: 1, processingS: 0.5, realtimeFactor: 2 } }));
      });
    });
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const waits = LOST_WAITS_MS.splice(0, LOST_WAITS_MS.length, 20, 20, 20, 20);
  const close = async () => {
    LOST_WAITS_MS.splice(0, LOST_WAITS_MS.length, ...waits);
    for (const c of wss.clients) c.terminate();
    await new Promise((r) => http.close(r));
  };
  return { url: `ws://127.0.0.1:${http.address().port}/v1/realtime/sessions/tok/socket`, seen, close };
}

test('a socket lost with no close frame is opened again while the server says try again, and the session goes on', async (t) => {
  const s = await lostServer(['again', 'again']);
  t.mock.timers.enable({ apis: ['Date'] });
  try {
    const session = await RealtimeSession.connect({ sessionId: 's', streamUrl: s.url });
    t.mock.timers.tick(31_000);
    const done = drain(session);
    session.sendAudio(new Uint8Array(3200));
    await new Promise((r) => setTimeout(r, 30));
    session.sendAudio(new Uint8Array(1600));
    session.eof();
    const { err } = await done;
    assert.equal(err, null, `the server its socket was on died; the session went on: ${err?.message}`);
    assert.equal(s.seen.upgrades, 4, 'two tries told to come back, then let in');
    assert.equal(s.seen.bytes[3], 1600, 'the audio sent meanwhile reached the next socket');
    assert.equal(session.doneReason, 'eof');
  } finally {
    await s.close();
  }
});

for (const [answers, upgrades, why] of [
  [['gone'], 2, 'refused for good: the session ended on the server'],
  [['silent'], 2, 'no answer from the server: nothing says it will come back'],
  [['again', 'again', 'again', 'again'], 5, 'told to come back past the last try'],
]) {
  test(`a socket lost with no close frame ends as engine_lost when it cannot go on (${why})`, async (t) => {
    const s = await lostServer(answers);
    t.mock.timers.enable({ apis: ['Date'] });
    try {
      const session = await RealtimeSession.connect({ sessionId: 's', streamUrl: s.url });
      t.mock.timers.tick(31_000);
      const done = drain(session);
      session.sendAudio(new Uint8Array(64));
      const { err } = await done;
      assert.equal(err?.code, 'engine_lost', why);
      assert.match(err.message, /1006/);
      assert.equal(s.seen.upgrades, upgrades, why);
    } finally {
      await s.close();
    }
  });
}

test('a socket lost with no close frame soon after it opened is opened again once, and the session goes on', async () => {
  const s = await lostServer(['serve']);
  try {
    const session = await RealtimeSession.connect({ sessionId: 's', streamUrl: s.url });
    const done = drain(session);
    session.sendAudio(new Uint8Array(64));
    await new Promise((r) => setTimeout(r, 30));
    session.sendAudio(new Uint8Array(1600));
    session.eof();
    const { err } = await done;
    assert.equal(err, null, `the server died in the session's first seconds; it went on: ${err?.message}`);
    assert.equal(s.seen.upgrades, 2, 'one try for a young socket');
    assert.equal(session.doneReason, 'eof');
  } finally {
    await s.close();
  }
});

test('a second socket lost soon after it opened is engine_lost, so a server that lets it in and drops it cannot loop the client', async () => {
  const s = await lostServer(['drop']);
  try {
    const session = await RealtimeSession.connect({ sessionId: 's', streamUrl: s.url });
    const done = drain(session);
    session.sendAudio(new Uint8Array(64));
    await new Promise((r) => setTimeout(r, 30));
    session.sendAudio(new Uint8Array(64));
    const { err } = await done;
    assert.equal(err?.code, 'engine_lost');
    assert.equal(s.seen.upgrades, 2, 'one early try, then no more');
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
