import assert from 'node:assert/strict';
import { test } from 'node:test';

import { VocalStack } from '../dist/index.js';

function fakeFetch(pages) {
  const urls = [];
  const fetch = async (url) => {
    urls.push(new URL(String(url)));
    return new Response(JSON.stringify(pages[Math.min(urls.length - 1, pages.length - 1)]), { status: 200 });
  };
  return { fetch, urls };
}

test('transcriptions.list follows nextCursor to the last page', async () => {
  const { fetch, urls } = fakeFetch([
    { transcriptions: [{ id: 't1' }, { id: 't2' }], nextCursor: 'c1' },
    { transcriptions: [{ id: 't3' }], nextCursor: 'c2' },
    { transcriptions: [{ id: 't4' }] },
  ]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch });
  assert.deepEqual((await vs.transcriptions.list('archived')).map((t) => t.id), ['t1', 't2', 't3', 't4']);
  assert.deepEqual(urls.map((u) => u.searchParams.get('cursor')), [null, 'c1', 'c2']);
  assert.ok(urls.every((u) => u.searchParams.get('lifecycle') === 'archived'));
});

test('transcriptions.listPage asks for one page with cursor and limit', async () => {
  const { fetch, urls } = fakeFetch([{ transcriptions: [{ id: 't1' }], nextCursor: 'c9' }]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch });
  const page = await vs.transcriptions.listPage({ cursor: 'c8', limit: 100 });
  assert.equal(page.nextCursor, 'c9');
  assert.equal(urls.length, 1);
  assert.equal(urls[0].searchParams.get('cursor'), 'c8');
  assert.equal(urls[0].searchParams.get('limit'), '100');
});

test('corrections.list and listRecordings read every page', async () => {
  const { fetch, urls } = fakeFetch([{ corrections: [{ id: 'k1' }], nextCursor: 'a' }, { corrections: [{ id: 'k2' }] }]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch });
  assert.deepEqual((await vs.corrections.list('r1')).map((c) => c.id), ['k1', 'k2']);
  assert.equal(urls[1].pathname, '/v1/recordings/r1/corrections');
  const r = fakeFetch([{ recordings: [{ id: 'r1' }], nextCursor: 'b' }, { recordings: [{ id: 'r2' }] }]);
  const vs2 = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch: r.fetch });
  assert.deepEqual((await vs2.broadcasts.listRecordings('b1')).map((x) => x.id), ['r1', 'r2']);
  assert.equal(r.urls[1].searchParams.get('cursor'), 'b');
});

test('recordings.events starts after a seq, then follows the cursor', async () => {
  const { fetch, urls } = fakeFetch([{ events: [{ seq: 4 }, { seq: 5 }], nextCursor: '5' }, { events: [{ seq: 6 }] }]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch });
  assert.deepEqual((await vs.recordings.events('r1', { after: 3, limit: 2 })).map((e) => e.seq), [4, 5, 6]);
  assert.equal(urls[0].searchParams.get('after'), '3');
  assert.equal(urls[0].searchParams.get('cursor'), null);
  assert.equal(urls[1].searchParams.get('after'), null, 'never cursor and after together');
  assert.equal(urls[1].searchParams.get('cursor'), '5');
  assert.equal(urls[1].searchParams.get('limit'), '2');
});
