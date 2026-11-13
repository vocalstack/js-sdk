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

test('transcriptions.corrections reads every page', async () => {
  const { fetch, urls } = fakeFetch([{ corrections: [{ id: 'k1' }], nextCursor: 'a' }, { corrections: [{ id: 'k2' }] }]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch });
  assert.deepEqual((await vs.transcriptions.corrections('t1')).map((c) => c.id), ['k1', 'k2']);
  assert.equal(urls[1].pathname, '/v1/transcriptions/t1/corrections');
  assert.equal(urls[1].searchParams.get('cursor'), 'a');
});

test('transcriptions.history starts after a seq, then follows the cursor', async () => {
  const { fetch, urls } = fakeFetch([{ events: [{ seq: 4 }, { seq: 5 }], nextCursor: '5' }, { events: [{ seq: 6 }] }]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch });
  assert.deepEqual((await vs.transcriptions.history('t1', { after: 3, limit: 2 })).map((e) => e.seq), [4, 5, 6]);
  assert.equal(urls[0].pathname, '/v1/transcriptions/t1/history');
  assert.equal(urls[0].searchParams.get('after'), '3');
  assert.equal(urls[0].searchParams.get('cursor'), null);
  assert.equal(urls[1].searchParams.get('after'), null, 'never cursor and after together');
  assert.equal(urls[1].searchParams.get('cursor'), '5');
  assert.equal(urls[1].searchParams.get('limit'), '2');
});

test('transcriptions.list and listPage send the search filters', async () => {
  const { fetch, urls } = fakeFetch([{ transcriptions: [{ id: 't1', shareCode: 'abc' }], nextCursor: 'c1' }, { transcriptions: [{ id: 't2', shareCode: 'def' }] }]);
  const vs = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch });
  const all = await vs.transcriptions.list({ shared: true, q: 'team meeting', site: 'youtube', language: 'en', kind: 'link', tag: 'Talks', createdAfter: '2026-01-01', createdBefore: new Date('2026-02-01T00:00:00Z') });
  assert.deepEqual(all.map((t) => t.shareCode), ['abc', 'def']);
  assert.deepEqual(urls.map((u) => u.searchParams.get('cursor')), [null, 'c1']);
  for (const u of urls) {
    assert.equal(u.searchParams.get('shared'), 'true');
    assert.equal(u.searchParams.get('q'), 'team meeting');
    assert.equal(u.searchParams.get('site'), 'youtube');
    assert.equal(u.searchParams.get('language'), 'en');
    assert.equal(u.searchParams.get('kind'), 'link');
    assert.equal(u.searchParams.get('tag'), 'Talks');
    assert.equal(u.searchParams.get('createdAfter'), '2026-01-01');
    assert.equal(u.searchParams.get('createdBefore'), '2026-02-01T00:00:00.000Z');
    assert.equal(u.searchParams.get('origin'), null);
  }
  const one = fakeFetch([{ transcriptions: [] }]);
  const vs2 = new VocalStack({ baseUrl: 'http://api.test', apiKey: 'vs_key_x', fetch: one.fetch });
  await vs2.transcriptions.listPage({ shared: false, origin: 'api', broadcast: 'b1', limit: 5 });
  assert.deepEqual(Object.fromEntries(one.urls[0].searchParams), { shared: 'false', origin: 'api', broadcast: 'b1', limit: '5' });
});
