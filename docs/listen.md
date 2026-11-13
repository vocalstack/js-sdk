<!-- Generated from https://api.vocalstack.com/docs/guides/listen.md; edits here are overwritten. -->

# Listen

> Follow a transcription as it happens, in any language: subscribe, catch up from a snapshot, then apply live frames in order.

| Endpoint | What it does |
|---|---|
| `GET /v1/transcriptions/{id}/transcript` | Get a transcript |
| `GET /v1/transcriptions/{id}` | Get a transcription |
| `WS /v1/transcriptions/{id}/subscribe` | Follow a recording: first frame `subscribe.ready {lastSeq}`, then `GET /v1/transcriptions/{id}/transcript` and discard buffered frames with `seq <= lastSeq`. |

Anyone allowed to read a transcription can follow it live over its subscribe socket: the owner with an API key, a reader with a share link's code, anyone at all on a public broadcast. The socket sends what changes from the moment it opens; what was said before is read once, from a snapshot. Getting the two to meet without a gap or a duplicate is the whole trick, and the cursor makes it exact.

## 1. Find the transcription

Subscribing takes a transcription id. The owner has it already: the transcription's `id` (the publish grant's `transcription.id` is the same), or a broadcast's `currentTranscription.transcriptionId`. Each press of Record on a broadcast makes a new transcription, so a screen waiting for a broadcast to go live opens its events socket (`WS /v1/broadcasts/{id}/events`, or `/v1/transcriptions/{id}/events` for one transcription) and gets `transcription.started` with the `transcriptionId` the moment it does.

## 2. Subscribe

Open `WS /v1/transcriptions/{id}/subscribe`. The owner sends the API key as `Authorization: Bearer …` (never in the URL); a share link's reader adds `shareCode=`; a public broadcast's listener sends nothing. `lang=es` reads it translated (through a share link, the link must allow translation), and VocalStack picks the voice that speaks it ([Live translation and spoken translations](translation-and-voices.md)). The first frame is `subscribe.ready`: the transcription's `state` and `lastSeq`, the cursor the live sequence is at.

## 3. Catch up

Read `GET /v1/transcriptions/{id}/transcript` (same `lang`, same credential): every sentence and segment up to the snapshot's own `lastSeq`. Every durable frame on the socket carries a `cursor`, gapless per transcription; skip the frames whose `cursor` is at or below the snapshot's `lastSeq` (they are in it already) and apply the rest in order. A listener gets a `noop` frame in place of one withheld from it, so the cursor never skips. If it does jump (a dropped frame, `subscribe.gap`), read the transcript again with `after=<cursor>` and carry on from its `lastSeq`. `vs.transcriptions.subscribe` in the TypeScript SDK does all of this and hands you the snapshot first. When that second read fails (a rate limit, a network blip) it holds the frames that arrive and asks again, waiting 1, 2, 4 and up to 30 seconds between tries, or as long as a rate limit asks. If the transcript still cannot be read after a minute, or the answer is a refusal, the subscription ends with a `closed` event whose `reason` is `catch-up failed`: subscribe again to start from a fresh snapshot. To come back after any dropped subscription without reading the whole transcript again, pass the old subscription's `cursor` as `since` (`vs.transcriptions.subscribe(id, { since: sub.cursor })`): its first snapshot is then only what changed after that cursor, merged like a gap.

```text
+0.0s {"type":"subscribe.ready","transcriptionId":"5c0d…","lastSeq":41,"state":"live","instance":"api-1"}
+0.2s {"type":"(snapshot)","lastSeq":42,"text":"Good morning, everyone. Thanks for coming in today."}
+0.6s {"type":"transcript.committed","cursor":42,"seq":42,"segment":{"seq":17,"start":5.1,"end":6.0,"text":"Thanks for coming in today.","speaker":0,"words":[]}}
+1.9s {"type":"transcript.committed","cursor":43,"seq":43,"segment":{"seq":18,"start":6.4,"end":8.2,"text":"Let us start with the budget.","speaker":0,"words":[]}}
+2.2s {"type":"transcript.translated","cursor":44,"seq":18,"translations":{"es":"Empecemos por el presupuesto."}}
+3.0s {"type":"noop","cursor":45,"seq":45}
+4.4s {"type":"recording.state","cursor":46,"seq":46,"transcriptionId":"5c0d…","state":"paused"}
```

## 4. Follow it live

From there, frames arrive as the transcription goes: `transcript.committed` appends a segment (a subscriber gets no drafts), `transcript.sentence` replaces a whole sentence by `sentenceId`, `transcript.translated` fills a segment's translations, `transcript.amended` (the engine) and `transcript.corrected` (a person) rewrite one in place, and `recording.state` says `live`, `paused`, `ended`, `finalized`. Change language without reopening: send `{"type":"subscribe.update","lang":"fr"}` (`setLanguage` in the SDK), then read the snapshot again in it.

## 5. When it ends

At `ended` the socket stays open: corrections and the last translations can still arrive until `finalized`. Close it when you are done. Afterwards, the snapshot is the whole transcript, and `GET /v1/transcriptions/{id}` says how it ended (`state`, `endReason`).

## Complete code

Each program runs as it is once `VOCALSTACK_API_KEY` holds one of your API keys.

### `listen.ts`

```typescript
import { VocalStack } from '@vocalstack/js-sdk';

const vs = new VocalStack({ baseUrl: 'https://api.vocalstack.com', apiKey: process.env.VOCALSTACK_API_KEY });
const transcriptionId = process.argv[2]!; // a transcription's id, or a broadcast's currentTranscription.transcriptionId

// The owner, with the key. A share link's reader: new VocalStack({ baseUrl })
// and { shareCode: 'CODE', asOwner: false }; a public broadcast's listener: { asOwner: false }.
const sub = await vs.transcriptions.subscribe(transcriptionId, { lang: 'es' });

// subscribe() resolves once subscribe.ready and the snapshot are in: what
// was said before you came, then only frames past its cursor, gaps healed.
for (const s of sub.snapshot?.sentences ?? []) console.log(s.text, s.translations?.es ?? '');

for await (const ev of sub) {
  if (ev.type !== 'frame') continue;
  const f = ev.frame;
  if (f.type === 'transcript.committed') console.log(f.segment.text);
  if (f.type === 'transcript.translated') console.log(`  es: ${f.translations.es}`);
  if (f.type === 'recording.state') {
    console.log(`[${f.state}]`);
    if (f.state === 'finalized') sub.close();
  }
}
```

---

The same guide for every SDK and for plain HTTP + WebSocket: https://api.vocalstack.com/docs/guides/listen.md. Every guide: [docs/](./).
