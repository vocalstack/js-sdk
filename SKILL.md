---
name: vocalstack
description: Use when writing Node or TypeScript code that calls the VocalStack speech API with @vocalstack/sdk, for example to transcribe an audio or video URL or a local file, stream live audio for realtime transcription, fetch or export a transcript (JSON, SRT, XLSX, PDF), or search transcripts. Covers installing, API keys, base URLs, five copy-paste programs and error handling (401, 402, 403, 429).
---

# VocalStack TypeScript SDK

The VocalStack API transcribes speech (files, links, live audio), with speaker
labels and translation. `@vocalstack/sdk` has one client, `VocalStack`, with
one group per resource: `vs.transcriptions`, `vs.jobs`, `vs.recordings`,
`vs.broadcasts`, `vs.search`, `vs.realtime` and a few more (listed at the end).

## What is what

- A **transcription** is a file, a link, a microphone or a stream, transcribed
  and stored. Create one with `vs.transcriptions.create(...)`.
- A **recording** is one take inside it. Its id (`recordingId`) is what you
  read the transcript and exports with: `vs.recordings.transcript(recordingId)`.
- A **job** is a file or link recording's transcription work:
  `vs.jobs.wait(recordingId)` polls it until it is `done` or `failed`
  (`{ onProgress: (job) => … }` sees each read: `job.state`, `job.progress.pct`).
- A **broadcast** is a link listeners open to follow a live recording.
- A **realtime session** (`vs.realtime`) is a socket you stream audio into and
  read the transcript from. Nothing is stored. "Session" means only this.

## Install

```sh
npm init -y && npm pkg set type=module   # in a new folder: the programs below are ESM
npm i @vocalstack/sdk                    # Node 20 or newer
```

Before the package is published, any account installs
the private build its environment serves: the API reference's Install section
(`<base>/docs`, or Developers -> API reference in the app) and `<base>/sdk/latest`
give the exact commands, which send `VOCALSTACK_API_KEY` to that host only.
Or install it from a local checkout of the repository. Build the two
packages first unless both `sdks/typescript/dist` and `sdks/typescript/node_modules` already exist (a `dist` without its
`node_modules` fails with `ERR_MODULE_NOT_FOUND @vocalstack/contract`):

```sh
(cd /absolute/path/to/transcribe/packages/contract && npm install && npm run build)
(cd /absolute/path/to/transcribe/sdks/typescript && npm install && npm run build)
npm i /absolute/path/to/transcribe/sdks/typescript
```

Use ESM (`"type": "module"` in package.json, or `.mjs` files).

Speaker numbers start at 0. A speaker of `-1` means speaker labels were off
for that transcription, so print the text without a speaker.

## Auth and base URL

- Read the key from `VOCALSTACK_API_KEY` and pass it as `apiKey`. It goes out
  as `Authorization: Bearer <key>`, also on sockets.
- An API key starts with `vs_key_`. There is one kind of key: every call is
  real usage on the account's tier and quotas.
- Keys are for servers. Never put a key in browser code or in a URL. The API
  refuses a key sent from a web page (`Origin` header) or in a query string.
- Scopes: `read` (read transcripts, search, export), `write` and
  `recordings:publish` (create transcriptions, stream live audio), or `*`.
- Base URL: `https://api.vocalstack.com` (the default). Override it with
  `VOCALSTACK_BASE_URL`: `http://127.0.0.1:8090` for a local server,
  `https://api.e2e.vocalstack.com` for e2e.

Every program below starts like this:

```js
import { VocalStack } from '@vocalstack/sdk';
const vs = new VocalStack({
  baseUrl: process.env.VOCALSTACK_BASE_URL, // absent: https://api.vocalstack.com
  apiKey: process.env.VOCALSTACK_API_KEY,
});
```

## 1. Transcribe a URL and wait for the result

The server fetches the link itself, so it must be a public http(s) address.
Private, loopback and cloud-metadata addresses are refused.

```js
import { VocalStack } from '@vocalstack/sdk';
const vs = new VocalStack({ baseUrl: process.env.VOCALSTACK_BASE_URL, apiKey: process.env.VOCALSTACK_API_KEY });

const tx = await vs.transcriptions.create({
  url: 'https://raw.githubusercontent.com/openai/whisper/main/tests/jfk.flac',
  name: 'JFK sample',
});
const recordingId = tx.job.recordingId;

// queued -> fetching -> transcribing -> done | failed
const job = await vs.jobs.wait(recordingId);
if (job.state !== 'done') throw new Error(`transcription ${job.state}: ${job.error}`);

const { sentences } = await vs.recordings.transcript(recordingId);
for (const s of sentences) console.log(s.speaker >= 0 ? `[speaker ${s.speaker}] ${s.text}` : s.text);
console.log('recordingId', recordingId);
```

## 2. Transcribe a local file

```js
import { VocalStack } from '@vocalstack/sdk';
const vs = new VocalStack({ baseUrl: process.env.VOCALSTACK_BASE_URL, apiKey: process.env.VOCALSTACK_API_KEY });

const tx = await vs.transcriptions.create({
  file: process.argv[2], // a path (mp3, wav, flac, ogg, m4a, mp4 ...), a Blob or bytes
  settings: { spokenLanguage: 'en', speakerLabels: 'on' }, // both optional; speakerLabels: 'auto' | 'on' | 'off'
});
const job = await vs.jobs.wait(tx.job.recordingId);
if (job.state !== 'done') throw new Error(`transcription ${job.state}: ${job.error}`);

const { sentences } = await vs.recordings.transcript(job.recordingId);
console.log(sentences.map((s) => s.text).join(' '));
```

## 3. Fetch a transcript or an export file

`recordings.transcript` returns segments (with word timings), sentences and
speakers. `recordings.export` returns the file as a `Response`: formats `json`,
`srt`, `xlsx`, `pdf`; add `{ lang: '<code>' }` for a translated file.

```js
import { writeFile } from 'node:fs/promises';
import { VocalStack } from '@vocalstack/sdk';
const vs = new VocalStack({ baseUrl: process.env.VOCALSTACK_BASE_URL, apiKey: process.env.VOCALSTACK_API_KEY });
const recordingId = process.argv[2];

const snap = await vs.recordings.transcript(recordingId);
console.log(`${snap.segments.length} segments, ${snap.sentences.length} sentences, state ${snap.state}`);

const res = await vs.recordings.export(recordingId, 'srt');
await writeFile('transcript.srt', Buffer.from(await res.arrayBuffer()));
```

## 4. Live transcription from a microphone or a file

A live transcription takes raw PCM: 32-bit float little-endian, 16 kHz, mono.
Create it, start a recording, and open the publisher socket the grant names.
Here ffmpeg decodes a file at realtime speed (`-re`). For a microphone, swap
the input: `-f avfoundation -i :0` on macOS, `-f pulse -i default` on Linux.
(`@vocalstack/sdk/mic` is for browsers, and browsers must not hold API keys.)

```js
import { spawn } from 'node:child_process';
import { VocalStack } from '@vocalstack/sdk';
const vs = new VocalStack({ baseUrl: process.env.VOCALSTACK_BASE_URL, apiKey: process.env.VOCALSTACK_API_KEY });

const tx = await vs.transcriptions.createLive({ name: 'Live demo', settings: { spokenLanguage: 'en' } });
const grant = await vs.transcriptions.startRecording(tx.id);
const stream = await vs.recordings.publish(grant, { readyDeadlineMs: 180_000 }); // a cold engine can take a while

const ff = spawn('ffmpeg', ['-loglevel', 'error', '-re', '-i', process.argv[2],
  '-f', 'f32le', '-ac', '1', '-ar', '16000', '-']);
ff.stdout.on('data', (chunk) => stream.sendAudio(new Uint8Array(chunk)));
ff.on('close', () => stream.eof()); // eof() ends the recording

for await (const ev of stream) {
  if (ev.type === 'transcript.committed') console.log(`[speaker ${ev.segment.speaker}] ${ev.segment.text}`);
  // also: 'transcript.draft' (replaces the live tail), 'transcript.sentence', 'transcript.translated'
}

// To end a recording without eof(): vs.recordings.pause(id), then vs.recordings.stop(id).
const { sentences } = await vs.recordings.transcript(grant.recording.id);
console.log('final:', sentences.map((s) => s.text).join(' '));
```

To transcribe without storing anything, use a realtime session instead:
`await vs.realtime.transcribeFile('talk.mp3')` returns `{ text, segments }`.

## 5. Search transcripts

```js
import { VocalStack } from '@vocalstack/sdk';
const vs = new VocalStack({ baseUrl: process.env.VOCALSTACK_BASE_URL, apiKey: process.env.VOCALSTACK_API_KEY });

const { hits } = await vs.search.query(process.argv[2] ?? 'country', { limit: 5 }); // q: 2+ characters
for (const h of hits) {
  console.log(`${h.linkName} @ ${h.mediaStart.toFixed(1)}s [speaker ${h.speaker}]: ${h.text} (recording ${h.recordingId})`);
}
```

## Errors

A failed call throws `VocalStackError` with `code`, `message`, `status`,
`retryable`, `details` (the body's `data.details`), `headers` and
`retryAfter` (seconds, from `Retry-After`). A `429`, and a `503 unavailable`
on a call that is safe to repeat, is retried for you after its `Retry-After`,
twice by default (`maxRetries` on the client).

| Status | `code` | What to do |
|---|---|---|
| 401 | `invalid_token`, `key_expired`, `key_revoked` | Check `VOCALSTACK_API_KEY`. Use the replacement key, or create a new one. |
| 403 | `forbidden` | Usually a missing scope: the message names it, and `err.headers.get('www-authenticate')` lists the scopes the route needs. A suspended key or account gets `suspended`. |
| 402 | `insufficient_credit` | The account's credit is out, or does not cover the transcription: every transcription is billed at least the plan's minimum (`rates.minimumSeconds`, 5 minutes). `details`: `balance`, `plan`, `topUpUrl`, and `required` when the cost was known up front. Add credit; `vs.billing.get()` shows the balance. |
| 409 | `payment_method_required` | Auto top-up (`vs.billing.setAutoTopUp`) and the portal (`vs.billing.portal()`) need a payment first (`vs.billing.createCheckout({ kind: 'topup', amount, acceptTerms: true })` opens one; a signed-in person's token, never an API key). |
| 402 | `quota_exceeded` | The plan's transcriptions-at-once limit is reached. `details`: `metric` (`concurrent_transcriptions`), `limit`, `used`, `plan`, `topUpUrl`. |
| 429 | `rate_limited` | Retried automatically; if it still fails, wait `err.retryAfter` seconds. Every response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`. |
| 503 | `unavailable` | The service is waking (its database was asleep). Retried automatically after `Retry-After` (2 s) on calls that are safe to repeat: GET, HEAD, DELETE, or any call with `{ idempotencyKey }`. A create without a key is not retried: retry it yourself, with an `idempotencyKey` so it cannot run twice. A realtime socket refused this way throws `unavailable`; a bare 503 there is `capacity_exceeded`. |

```js
import { VocalStack, VocalStackError } from '@vocalstack/sdk';
const vs = new VocalStack({ baseUrl: process.env.VOCALSTACK_BASE_URL, apiKey: process.env.VOCALSTACK_API_KEY });

try {
  await vs.search.query('country');
} catch (err) {
  if (!(err instanceof VocalStackError)) throw err;
  if (err.code === 'insufficient_credit' || err.code === 'quota_exceeded') console.error(err.message, err.details);
  else console.error(err.status, err.code, err.message);
}
```

## More

- The other groups: `vs.transcriptions` (`list`, `get`, `update`, `archive`,
  `restore`, `purge`, `listShareLinks`, `createShareLink`), `vs.recordings`
  (`get`, `summarize`, `summary`, `translation`, `audioUrl`, `subscribe` for a
  live transcript feed), `vs.corrections`, `vs.shareLinks`, `vs.voices`,
  `vs.broadcasts`, `vs.me` (`get`, `usage`), `vs.languages`,
  `vs.rtmp`, `vs.events`, `vs.meta`. Each method is named after its operation
  in the OpenAPI document (`transcriptions.create` is `POST /v1/transcriptions`).
- `<base>/llms.txt` lists every operation in a form written for agents.
  `<base>/llms-full.txt` adds parameters, auth mode, tier and scopes.
- `<base>/docs` is the interactive reference. `<base>/v1/openapi.json` is
  the OpenAPI document; the SDK's types are generated from it.
