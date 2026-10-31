<!-- Generated from https://api.vocalstack.com/docs/guides/transcribe-a-batch.md; edits here are overwritten. -->

# Transcribe a batch of files

> Send many files or links as one batch, start it once, and read every transcript when it is done. Cheaper than one transcription per file.

| Endpoint | What it does |
|---|---|
| `POST /v1/batches` | Create a batch |
| `POST /v1/batches/{id}/files` | Add a file to a batch |
| `POST /v1/batches/{id}/start` | Start a batch |
| `GET /v1/batches/{id}` | Get a batch |
| `GET /v1/batches/{id}/export` | Download a batch's transcripts |

A batch is several files transcribed together, for less than a transcription each: the batch counts once against the plan's transcriptions created per hour, and it is billed by the second of audio, each file for at least a minute (`rates.batchFileMinimumSeconds`) and the whole batch for at least one minimum charge, not one per file. Each file is still a transcription of its own (its `batchId` names the batch), with its job, transcript, audio and exports, and speaker labels when the batch asks for them. A batch's files never get a summary, a title, a share link or spoken translations.

Create the batch, add each file or link, start it, then wait for it to be `done`.

## 1. Create the batch

`POST /v1/batches` answers `201` with an `open` batch. The body is optional: a `name` (by default the batch is named for its date) and `settings` every file runs with, `spokenLanguage` (absent: detected per file; name it when you know it, and each file starts sooner), `speakerLabels` (`auto` by default, `on` or `off`), `latencyMode`, and `voiceCloning` (each speaker read in their own cloned voice; turning it on needs `voiceCloningConsent: true`, your confirmation that everyone speaking agreed).

## 2. Add the files

`POST /v1/batches/{id}/files` takes one file or link per call, the way `POST /v1/transcriptions` does: `multipart/form-data` with a `file` part, or JSON with a `url`. Of the options, only `name`, `startS`, `endS` and `durationS` apply (the settings are the batch's). The answer is the file's transcription; its job waits for the batch's start. In the SDKs, adding a file takes either a file or a `url`, and adding a URL is the link shorthand (`addFile` / `addUrl` in TypeScript and PHP, `add_file` / `add_url` in Python).

A batch holds up to the plan's files per batch (`limits.filesPerBatch` in `GET /v1/billing/plans`); one more is refused with `invalid_state`. Send the rest in another batch.

## 3. Start it

`POST /v1/batches/{id}/start` seals the batch (no more files) and queues its files, longest first: as many run at once as the plan allows transcriptions at once. The account needs credit for more than one minimum charge; each file's length is checked against the balance as it starts. A batch that was never started can be deleted with `DELETE /v1/batches/{id}` (nothing was charged); a started one is stopped with `POST /v1/batches/{id}/stop`.

## 4. Wait for it

`GET /v1/batches/{id}` answers with the batch, its `counts` (`queued`, `running`, `done`, `failed`, `stopped`) and its `files`, each a transcription with its `job`. The batch is `running` until every file has finished or failed, then `done`. The SDKs' `batches.wait` reads it every 5 s until the batch is closed (`finishedAt`: a stopped batch waits for a file it was still running); a failed file does not fail the wait, so check `counts.failed`.

## 5. Read the transcripts

Each file's transcript is `GET /v1/recordings/{id}/transcript` with its `job.recordingId`, as for a single file. `GET /v1/batches/{id}/export` returns every finished file's transcript in one `format` (`srt`, `json`, `xlsx` or `pdf`) as one zip.

## Complete code

Each program runs as it is once `VOCALSTACK_API_KEY` holds one of your API keys.

### `batch.ts`

```typescript
import { writeFile } from 'node:fs/promises';
import { VocalStack } from '@vocalstack/js-sdk';

const vs = new VocalStack({ baseUrl: 'https://api.vocalstack.com', apiKey: process.env.VOCALSTACK_API_KEY });

const batch = await vs.batches.create({ name: 'Interviews', settings: { spokenLanguage: 'en', speakerLabels: 'auto' } });

await vs.batches.addFile(batch.id, { file: './interview-1.mp3' });
await vs.batches.addFile(batch.id, { file: './interview-2.mp3' });
await vs.batches.addUrl(batch.id, 'https://raw.githubusercontent.com/openai/whisper/main/tests/jfk.flac', { name: 'JFK' });

await vs.batches.start(batch.id);

const done = await vs.batches.wait(batch.id, {
  onProgress: (b) => console.log(`${b.state}: ${b.counts.done} done, ${b.counts.running} running, ${b.counts.queued} queued`),
});
if (done.counts.failed > 0) console.log(`${done.counts.failed} file(s) failed`);

for (const tx of done.files ?? []) {
  if (tx.job?.state !== 'done') continue;
  const { sentences } = await vs.recordings.transcript(tx.job.recordingId);
  console.log(`${tx.name}: ${sentences.map((s) => s.text).join(' ')}`);
}
const zip = await vs.batches.export(batch.id, 'srt');
await writeFile('interviews.zip', Buffer.from(await zip.arrayBuffer()));
```

---

The same guide for every SDK and for plain HTTP + WebSocket: https://api.vocalstack.com/docs/guides/transcribe-a-batch.md. Every guide: [docs/](./).
