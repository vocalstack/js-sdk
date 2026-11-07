import assert from 'node:assert/strict';
import { test } from 'node:test';

import { VocalStack } from '../dist/index.js';

function fakeFetch(body = []) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, headers: init.headers, body: init.body });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}

const R = 'rec-1';

test('media src builders match the URLs the dashboard builds', () => {
  const vs = new VocalStack({ baseUrl: 'https://api.test/' });
  const o = 'https://api.test';
  assert.equal(vs.recordings.audioSrc(R, { format: 'caf', shareCode: 'abc' }), `${o}/v1/recordings/${R}/audio?kind=delivery&format=caf&shareCode=abc`);
  assert.equal(
    vs.recordings.audioSrc(R, { kind: 'voice', lang: 'es', voice: 'v 1', format: 'ogg', token: 'tok', listenerToken: 'lt' }),
    `${o}/v1/recordings/${R}/audio?kind=voice&lang=es&format=ogg&voice=v%201&access_token=tok&listenerToken=lt`,
  );
  assert.equal(vs.recordings.audioSrc(R, { kind: 'background', format: 'ogg', media: 'm', token: 'tok' }), `${o}/v1/recordings/${R}/audio?kind=background&format=ogg&media=m`);
  assert.equal(vs.recordings.clipSrc(R, 1, 2.345, { shareCode: 'abc' }), `${o}/v1/recordings/${R}/audio/clip?startS=1.00&endS=2.35&shareCode=abc`);
  assert.equal(vs.recordings.clipSrc(R, 0, 3, { clean: true, media: 'm' }), `${o}/v1/recordings/${R}/audio/clip?startS=0.00&endS=3.00&clean=true&media=m`);
  assert.equal(
    vs.recordings.voiceClipSrc(R, 7, 'fr', { voice: '0=a;1=b', format: 'caf', part: 1, v: 'r2', shareCode: 'abc' }),
    `${o}/v1/recordings/${R}/voice/7?lang=fr&voice=0%3Da%3B1%3Db&format=caf&part=1&v=r2&shareCode=abc`,
  );
  assert.equal(vs.recordings.voiceClipSrc(R, 7, 'fr', { format: 'ogg', part: 0, token: 't' }), `${o}/v1/recordings/${R}/voice/7?lang=fr&format=ogg&access_token=t`);
});

test('renderVoice takes the old langs array and the full request with a share code', async () => {
  const { fetch, calls } = fakeFetch([]);
  const vs = new VocalStack({ baseUrl: 'https://api.test', fetch });
  await vs.recordings.renderVoice(R, ['es']);
  assert.equal(calls[0].url, `https://api.test/v1/recordings/${R}/voice`);
  assert.deepEqual(JSON.parse(calls[0].body), { langs: ['es'] });
  await vs.recordings.renderVoice(R, { langs: ['es', 'fr'], voiceBySpeaker: { 0: 'stock-a' }, near: 12, shareCode: 'abc' }, { idempotencyKey: 'k' });
  assert.equal(calls[1].url, `https://api.test/v1/recordings/${R}/voice?shareCode=abc`);
  assert.deepEqual(JSON.parse(calls[1].body), { langs: ['es', 'fr'], voiceBySpeaker: { 0: 'stock-a' }, near: 12 });
  assert.equal(calls[1].headers['idempotency-key'], 'k');
  await vs.recordings.renderVoice(R, { langs: ['es'], voiceBySpeaker: { 0: 'clone:abc' }, consent: true });
  assert.deepEqual(JSON.parse(calls[2].body), { langs: ['es'], voiceBySpeaker: { 0: 'clone:abc' }, consent: true });
});

test('shareLinks.open reads a share code with no credential', async () => {
  const { fetch, calls } = fakeFetch({ code: 'abc' });
  const vs = new VocalStack({ baseUrl: 'https://api.test', token: 'session', fetch });
  const s = await vs.shareLinks.open('abc/def');
  assert.equal(s.code, 'abc');
  assert.equal(calls[0].url, 'https://api.test/v1/shares/abc%2Fdef');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].headers.authorization, undefined);
});

test('transcriptions.lookup asks by link and gives null when there is none', async () => {
  const { fetch, calls } = fakeFetch({ transcription: null });
  const vs = new VocalStack({ baseUrl: 'https://api.test', token: 'session', fetch });
  assert.equal(await vs.transcriptions.lookup('https://youtu.be/dQw4w9WgXcQ?t=3'), null);
  assert.equal(calls[0].url, 'https://api.test/v1/transcriptions/lookup?url=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ%3Ft%3D3');
  assert.equal(calls[0].headers.authorization, 'Bearer session');
});

test('speakers.create and createFromAppearance send consent only when the caller gives it', async () => {
  const { fetch, calls } = fakeFetch({ id: 'spk-1' });
  const vs = new VocalStack({ baseUrl: 'https://api.test', fetch });
  await vs.speakers.create({ name: 'Ana', sample: new Uint8Array([1, 2, 3]) });
  assert.equal(calls[0].url, 'https://api.test/v1/speakers');
  assert.deepEqual(JSON.parse(calls[0].body.get('meta')), { name: 'Ana' });
  assert.ok(calls[0].body.get('sample'));
  await vs.speakers.create({ name: 'Ana', consent: true });
  assert.deepEqual(JSON.parse(calls[1].body.get('meta')), { name: 'Ana', consent: true });
  await vs.speakers.createFromAppearance({ transcriptionId: 'tx-1', appearance: 2, name: 'Ana' });
  assert.equal(calls[2].url, 'https://api.test/v1/speakers/from-appearance');
  assert.deepEqual(JSON.parse(calls[2].body), { transcriptionId: 'tx-1', appearance: 2, name: 'Ana' });
  await vs.transcriptions.nameAppearance('tx-1', 2, 'Host');
  assert.equal(calls[3].url, 'https://api.test/v1/transcriptions/tx-1/appearances/2');
  assert.equal(calls[3].method, 'PUT');
  assert.deepEqual(JSON.parse(calls[3].body), { name: 'Host' });
});
