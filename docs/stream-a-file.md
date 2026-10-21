<!-- Generated from https://api.vocalstack.com/docs/guides/stream-a-file.md; edits here are overwritten. -->

# Stream a file at full speed

> Send a file's bytes through a realtime session and read the transcript as fast as the server makes it. Nothing is stored.

| Endpoint | What it does |
|---|---|
| `POST /v1/realtime/sessions` | Create a realtime session |
| `WS /v1/realtime/sessions/{token}/socket` | Connect to the `streamUrl` a realtime session returned (treat it as opaque). |

A realtime session can take a whole file instead of a live microphone: you send the file's own bytes (mp3, wav, flac, ogg, m4a, a video…), the server decodes them and transcribes at full speed, many times faster than the audio plays, and the transcript comes back over the same socket. Nothing is stored. When you want the transcript kept, shareable and exportable, create a transcription instead ([Transcribe a file](transcribe-a-file.md)).

1. You → VocalStack: `POST /v1/realtime/sessions` (input: { kind: "file" })
2. VocalStack → you: `{ streamUrl }`
3. You → VocalStack: `open a WebSocket to streamUrl`
4. VocalStack → you: `session.ready`
5. You → VocalStack: `the file's bytes` (binary frames, as fast as the socket takes them)
6. You → VocalStack: `{"type":"eof"}` (transcription starts here)
7. VocalStack → you: `transcript.progress` (every few seconds)
8. VocalStack → you: `transcript.committed` (appends a final segment)
9. VocalStack → you: `session.done`

## 1. Create a file session

`POST /v1/realtime/sessions` with `input: { kind: "file" }` and the usual options (`spokenLanguage`, `translate`, `speakerLabels`). A file session sends no drafts unless you ask (`events: { drafts: true }`): a draft previews a live tail, and a file has none. The file's decoded length must fit `limits.maxDurationS` (`GET /v1/realtime/capabilities`); a longer one is refused with `invalid_audio`.

## 2. Send the bytes

Open the socket, wait for `session.ready`, then send the file as binary frames in chunks (the SDKs send 256 KB at a time and hold back while the socket's buffer is full), followed by `{"type":"eof"}`. Transcription starts at `eof`: no transcript frame arrives before it. `vs.realtime.transcribeFile` (TypeScript), `vs.realtime.transcribe_file` (Python) and `$vs->realtime->transcribeFile` (PHP) do all of this in one call.

## 3. Follow the progress

`transcript.progress` arrives on a timer (it is also the keep-alive) with `processedS`, the media seconds transcribed so far, and `totalS` once the file's length is known. Commits arrive as they are made, in order, with gapless `seq`; append them.

```text
+0.0s {"type":"session.ready"}
+2.1s {"type":"transcript.progress","processedS":0,"totalS":184.2}
+4.1s {"type":"transcript.progress","processedS":31.5,"totalS":184.2}
+4.3s {"type":"transcript.committed","segment":{"seq":0,"start":0.0,"end":4.2,"text":"Welcome back to the show.","speaker":0,"words":[{"start":0.0,"end":0.4,"text":"Welcome"},{"start":0.4,"end":0.7,"text":"back"},{"start":0.7,"end":0.9,"text":"to"},{"start":0.9,"end":1.0,"text":"the"},{"start":1.0,"end":1.4,"text":"show."}]}}
+4.4s {"type":"transcript.committed","segment":{"seq":1,"start":4.6,"end":9.8,"text":"Today we are talking about rivers.","speaker":0,"words":[{"start":4.6,"end":4.9,"text":"Today"},{"start":4.9,"end":5.1,"text":"we"},{"start":5.1,"end":5.3,"text":"are"},{"start":5.3,"end":5.8,"text":"talking"},{"start":5.8,"end":6.1,"text":"about"},{"start":6.1,"end":6.7,"text":"rivers."}]}}
+6.1s {"type":"transcript.progress","processedS":96.0,"totalS":184.2}
+8.0s {"type":"transcript.progress","processedS":184.2,"totalS":184.2}
+8.2s {"type":"session.done","reason":"eof","stats":{"audioS":184.2,"processingS":6.1,"realtimeFactor":30.2}}
```

## 4. Finish

After the last commit the server sends `session.done`: `reason` is `eof`, or `max_duration` when a file with no declared length ran past the limit and was cut, and `stats.realtimeFactor` says how much faster than real time it ran. The socket then closes.

## Complete code

Each program runs as it is once `VOCALSTACK_API_KEY` holds one of your API keys.

### `file.ts`

```typescript
import { VocalStack } from '@vocalstack/js-sdk';

const vs = new VocalStack({ baseUrl: 'https://api.vocalstack.com', apiKey: process.env.VOCALSTACK_API_KEY });

// transcribeFile creates the file session, sends the bytes and eof, and
// collects what comes back. Nothing is stored.
const result = await vs.realtime.transcribeFile('./talk.mp3', {
  spokenLanguage: 'en',
  speakerLabels: 'on',
  onProgress: ({ processedS, totalS }) => console.log(`${processedS.toFixed(0)} s of ${totalS?.toFixed(0) ?? '?'} s`),
  onCommit: (segment) => console.log(`#${segment.seq} [${segment.speaker}] ${segment.text}`),
});

console.log(result.text);
console.log(`${result.doneReason}: ${result.stats?.realtimeFactor}× real time`);
```

---

The same guide for every SDK and for plain HTTP + WebSocket: https://api.vocalstack.com/docs/guides/stream-a-file.md. Every guide: [docs/](./).
