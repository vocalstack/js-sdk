<!-- Generated from https://api.vocalstack.com/docs/guides/quickstart.md; edits here are overwritten. -->

# Quickstart

> An API key, the SDK, and your first transcript in a dozen lines.

| Endpoint | What it does |
|---|---|
| `POST /v1/transcriptions` | Create a transcription |
| `GET /v1/recordings/{id}/job` | Get a job |
| `GET /v1/recordings/{id}/transcript` | Get a transcript |

Three steps: create an API key, install an SDK, transcribe a file. The program at the end uploads `talk.mp3` (any mp3, wav, flac, ogg, m4a or mp4 works), waits for its job and prints the transcript.

## 1. Create an API key

Open Developers → API keys and create a key with the **Read** and **Write** permissions. It is shown once: copy it into `VOCALSTACK_API_KEY`. By default a key reaches only what it creates; to read transcriptions made in the dashboard too, pick **Everything on this account** on its **Reach** tab (you can change it later with **Edit key**).

A key is for servers and scripts. The API refuses one sent from a web page or in a URL, so never put it in browser code; a browser streams through a session your server creates (see [Stream a microphone](stream-a-microphone.md)).

## 2. Install an SDK

Three SDKs, one client each (`VocalStack`), grouped by resource: `vs.transcriptions`, `vs.jobs`, `vs.recordings`, `vs.realtime` and a few more (`$vs->transcriptions` and so on in PHP). TypeScript runs on Node 20 or newer and in browsers; Python is asyncio, 3.10 or newer; PHP is synchronous, 8.1 or newer, installed with Composer.

```sh
# Not on npm yet: https://api.vocalstack.com/docs/guides/quickstart.md has the install command for the current build
```

The SDK is not on npm yet: the API serves its builds to every account, and the commands send your key to the API's host only. With HTTP + WebSocket there is nothing to install: the programs use curl and jq, and Node 22's built-in WebSocket (any WebSocket client works).

## 3. Transcribe a file

Transcribing a file is asynchronous: the upload answers at once with a transcription and its job, the job runs on the server, and the transcript is read when the job is done. There are no webhooks: `vs.jobs.wait` polls the job for you (every 2 s by default).

Every transcription is real usage: its audio spends the account's credit at the plan's rate per hour, billed per second with at least the plan's minimum per transcription (`rates.minimumSeconds` on `GET /v1/billing`), and when the credit does not cover a new one the API answers `402 insufficient_credit` ([Errors, retries and limits](errors-and-limits.md)). [Transcribe a file](transcribe-a-file.md) covers the job's states, progress and exports.

## 4. Next

- [Transcribe a link](transcribe-a-link.md): the server fetches a public URL or a YouTube video.
- [Stream a microphone](stream-a-microphone.md): live audio in, transcript events out, over one WebSocket.
- [Errors, retries and limits](errors-and-limits.md): what to do with a 402, a 429 or a 503.

## Complete code

Each program runs as it is once `VOCALSTACK_API_KEY` holds one of your API keys.

### `Terminal`

```bash
export VOCALSTACK_API_KEY="<your API key>"
mkdir vocalstack-quickstart && cd vocalstack-quickstart
npm init -y && npm pkg set type=module
# Not on npm yet: https://api.vocalstack.com/docs/guides/quickstart.md has the install command for the current build
npm install --save-dev tsx
npx tsx quickstart.ts
```

### `quickstart.ts`

```typescript
import { VocalStack } from '@vocalstack/sdk';

const vs = new VocalStack({ baseUrl: 'https://api.vocalstack.com', apiKey: process.env.VOCALSTACK_API_KEY });

const tx = await vs.transcriptions.create({ file: './talk.mp3' });
const job = await vs.jobs.wait(tx.job!.recordingId); // queued → transcribing → done
if (job.state !== 'done') throw new Error(`transcription ${job.state}: ${job.error ?? ''}`);

const { sentences } = await vs.recordings.transcript(job.recordingId);
for (const s of sentences) console.log(s.text);
```

---

The same guide for every SDK and for plain HTTP + WebSocket: https://api.vocalstack.com/docs/guides/quickstart.md. Every guide: [docs/](./).
