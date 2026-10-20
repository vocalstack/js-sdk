// `npm test` (after `npm run build`): `vs.connect.token()` against a fake
// fetch.  No network.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { VocalStack, VocalStackError } from '../dist/index.js';

/** A fetch answering `answers` in turn, recording each request. */
function fakeFetch(answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    return new Response(JSON.stringify(a.body), { status: a.status, headers: a.headers ?? {} });
  };
  return { fetch, calls };
}

const issued = {
  access_token: 'issued-key',
  token_type: 'api_key',
  key_id: '00000000-0000-4000-8000-000000000001',
  scope: 'read write',
  account: { name: 'Acme' },
};
const input = { code: 'c0de', codeVerifier: 'v'.repeat(43), redirectUri: 'https://app.test/cb?x=1' };

test('connect.token posts a form, with no credential even when the client has one', async () => {
  const { fetch, calls } = fakeFetch([{ status: 200, body: issued }]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'configured-key', fetch });
  const t = await vs.connect.token(input);
  assert.deepEqual(t, issued);
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.url, 'http://api.test/v1/connect/token');
  assert.equal(c.method, 'POST');
  assert.equal(c.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(c.headers.authorization, undefined);
  assert.equal(c.headers.origin, undefined);
  assert.equal(c.headers['sec-fetch-site'], undefined);
  const form = new URLSearchParams(c.body);
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('code'), 'c0de');
  assert.equal(form.get('code_verifier'), 'v'.repeat(43));
  assert.equal(form.get('redirect_uri'), 'https://app.test/cb?x=1');
});

test('a client with no credential at all can redeem a code', async () => {
  const { fetch, calls } = fakeFetch([{ status: 200, body: issued }]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', fetch });
  assert.equal((await vs.connect.token(input)).key_id, issued.key_id);
  assert.equal(calls[0].headers.authorization, undefined);
});

test("a 400 { error, error_description } is a VocalStackError with OAuth's code, not retried", async () => {
  const { fetch, calls } = fakeFetch([
    { status: 400, body: { error: 'invalid_grant', error_description: 'the code was already used' } },
    { status: 200, body: issued },
  ]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', fetch });
  await assert.rejects(
    vs.connect.token(input),
    (e) =>
      e instanceof VocalStackError &&
      e.code === 'invalid_grant' &&
      e.message === 'the code was already used' &&
      e.status === 400 &&
      e.retryable === false,
  );
  assert.equal(calls.length, 1);
});

test('a 429 is never retried either: the code works once', async () => {
  const limited = { defined: true, code: 'rate_limited', status: 429, message: 'slow down', data: { retryable: true } };
  const { fetch, calls } = fakeFetch([{ status: 429, body: limited, headers: { 'retry-after': '0' } }, { status: 200, body: issued }]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', fetch });
  await assert.rejects(vs.connect.token(input), (e) => e instanceof VocalStackError && e.code === 'rate_limited' && e.status === 429);
  assert.equal(calls.length, 1);
});
