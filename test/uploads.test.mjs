import assert from 'node:assert/strict';
import { test } from 'node:test';

import { VocalStack } from '../dist/index.js';

test('uploads.send puts each part to its link with no credential, then completes with the etags', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: init.method, headers: init.headers ?? {}, body: init.body });
    if (u === 'http://api.test/v1/uploads') {
      const req = JSON.parse(init.body);
      assert.deepEqual(req, { name: 'a.mp3', bytes: 10, mime: 'audio/mpeg' });
      return Response.json({ id: 'up-1', state: 'uploading', name: 'a.mp3', bytes: 10, partBytes: 6, expiresAt: 'x', parts: [{ number: 1, bytes: 6, url: 'https://store.test/p1' }, { number: 2, bytes: 4, url: 'https://store.test/p2' }] }, { status: 201 });
    }
    if (u.startsWith('https://store.test/')) {
      const n = u.endsWith('p1') ? 1 : 2;
      assert.equal(init.body.size, n === 1 ? 6 : 4);
      return new Response(null, { status: 200, headers: { etag: `"e${n}"` } });
    }
    if (u === 'http://api.test/v1/uploads/up-1/complete') return Response.json({ ...JSON.parse(init.body), id: 'up-1', state: 'complete' });
    throw new Error(`unexpected ${u}`);
  };
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'k', fetch });
  const seen = [];
  const done = await vs.uploads.send(new Blob([new Uint8Array(10)], { type: 'audio/mpeg' }), { name: 'a.mp3', onProgress: (s, t) => seen.push([s, t]) });
  assert.equal(done.state, 'complete');
  assert.deepEqual(done.parts, [{ number: 1, etag: '"e1"' }, { number: 2, etag: '"e2"' }]);
  for (const c of calls.filter((c) => c.url.startsWith('https://store.test/'))) assert.equal(c.headers.authorization, undefined);
  assert.deepEqual(seen.at(-1), [10, 10]);
});

test('uploads.send surfaces a server with direct uploads switched off as its error', async () => {
  const fetch = async () => Response.json({ code: 'invalid_state', status: 409, message: 'Direct uploads are not available yet; send the file with POST /v1/transcriptions.' }, { status: 409 });
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'k', fetch });
  await assert.rejects(vs.uploads.send(new Blob([new Uint8Array(3)]), { name: 'a.mp3' }), (e) => e.code === 'invalid_state' && /not available/.test(e.message));
});
