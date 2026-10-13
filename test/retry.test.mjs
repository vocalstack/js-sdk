// `npm test` (after `npm run build`): the transport's retries and the
// socket upgrade's refusals, against a fake fetch.  No network.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { VocalStack, VocalStackError } from '../dist/index.js';
import { retries } from '../dist/http.js';
import { upgradeRefused } from '../dist/realtime.js';

const envelope = (code, status, retryable) => ({ defined: true, code, status, message: code, data: { retryable } });

/** A fetch answering `answers` in turn, recording each request. */
function fakeFetch(answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    return new Response(a.body === undefined ? null : JSON.stringify(a.body), { status: a.status, headers: a.headers ?? {} });
  };
  return { fetch, calls };
}

const unavailable = { status: 503, body: envelope('unavailable', 503, true), headers: { 'retry-after': '0' } };
const ok = (body) => ({ status: 200, body });

test('a GET answered 503 unavailable is retried after its Retry-After', async () => {
  const { fetch, calls } = fakeFetch([unavailable, ok({ status: 'ok' })]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch });
  assert.deepEqual(await vs.meta.health(), { status: 'ok' });
  assert.equal(calls.length, 2);
});

test('the retries are bounded by maxRetries, then the error surfaces', async () => {
  const { fetch, calls } = fakeFetch([unavailable]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch, maxRetries: 2 });
  await assert.rejects(vs.meta.health(), (e) => e instanceof VocalStackError && e.code === 'unavailable' && e.status === 503 && e.retryable);
  assert.equal(calls.length, 3);
});

test('a POST without an Idempotency-Key is not retried on 503 unavailable', async () => {
  const { fetch, calls } = fakeFetch([unavailable, ok({ id: 'b1' })]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch });
  await assert.rejects(vs.broadcasts.create({ name: 'x' }), (e) => e.code === 'unavailable');
  assert.equal(calls.length, 1);
});

test('a POST carrying an Idempotency-Key is retried, with the same key', async () => {
  const { fetch, calls } = fakeFetch([unavailable, ok({ id: 'b1' })]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch });
  const b = await vs.broadcasts.create({ name: 'x' }, { idempotencyKey: 'k1' });
  assert.equal(b.id, 'b1');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].headers['idempotency-key'], 'k1');
});

test('a DELETE is retried; other 503s and 500s are not', async () => {
  assert.equal(retries(503, 'unavailable', 'DELETE'), true);
  assert.equal(retries(503, 'unavailable', 'HEAD'), true);
  assert.equal(retries(503, 'unavailable', 'PATCH'), false);
  assert.equal(retries(503, 'capacity_exceeded', 'GET'), false);
  assert.equal(retries(500, 'internal', 'GET'), false);
  assert.equal(retries(429, 'rate_limited', 'POST'), true);
});

test('a socket upgrade refused 503 with an unavailable body is unavailable', () => {
  const e = upgradeRefused(503, JSON.stringify(envelope('unavailable', 503, true)));
  assert.equal(e.code, 'unavailable');
  assert.equal(e.retryable, true);
});

test('a bare 503 (or one with another body) stays capacity_exceeded', () => {
  assert.equal(upgradeRefused(503, '').code, 'capacity_exceeded');
  assert.equal(upgradeRefused(503, '<html>busy</html>').code, 'capacity_exceeded');
  assert.equal(upgradeRefused(503, JSON.stringify(envelope('internal', 503, false))).code, 'capacity_exceeded');
  assert.equal(upgradeRefused(410, JSON.stringify(envelope('session_expired', 410, false))).code, 'session_expired');
});

test('an error names its request: the envelope requestId, else the X-Request-Id header', async () => {
  const fromBody = fakeFetch([{ status: 500, body: { ...envelope('internal', 500, false), requestId: 'req_body' } }]);
  const vs = new VocalStack({ baseUrl: 'https://api.example.test', apiKey: 'vs_key_x', maxRetries: 0, fetch: fromBody.fetch });
  const e1 = await vs.transcriptions.list().catch((e) => e);
  assert.ok(e1 instanceof VocalStackError);
  assert.equal(e1.requestId, 'req_body');
  const fromHeader = fakeFetch([{ status: 500, body: envelope('internal', 500, false), headers: { 'x-request-id': 'req_header' } }]);
  const vs2 = new VocalStack({ baseUrl: 'https://api.example.test', apiKey: 'vs_key_x', maxRetries: 0, fetch: fromHeader.fetch });
  const e2 = await vs2.transcriptions.list().catch((e) => e);
  assert.equal(e2.requestId, 'req_header');
});
