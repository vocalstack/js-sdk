<!-- Generated from https://api.vocalstack.com/docs/guides/translation-and-voices.md; edits here are overwritten. -->

# Live translation and spoken translations

> Translate a stream as it is spoken, and have each translated sentence spoken back in a voice. Text frames and audio clips, over the same socket.

| Endpoint | What it does |
|---|---|
| `GET /v1/languages` | List languages |
| `GET /v1/voices/available` | List available voices |
| `GET /v1/recordings/{id}/voice/{sentence}` | Get a spoken sentence |
| `GET /v1/recordings/{id}/voice` | Get a recording's voice tracks |
| `WS /v1/realtime/sessions/{token}/socket` | Connect to the `streamUrl` a realtime session returned (treat it as opaque). |

A realtime session (and every recording, for its listeners) can translate what is said into other languages as it goes, and speak the translation: each finished sentence is synthesised in the language's voice and sent as a short audio clip. Translations follow the transcript by a second or two; a spoken sentence follows its translation.

1. You → VocalStack: `options: translate ["es"], sentences { enabled: true }, voice ["es"]`
2. VocalStack → you: `transcript.committed` (the words as spoken)
3. VocalStack → you: `transcript.sentence (open)` (the sentence so far, a provisional translation)
4. VocalStack → you: `transcript.sentence (closed)` (the sentence and its final translation)
5. VocalStack → you: `transcript.voice` (that sentence, spoken in Spanish (Ogg/Opus))

## 1. Pick the languages

`GET /v1/languages` lists what can be transcribed (`transcription`), translated into (`translation`) and spoken (`voice`), with names. `GET /v1/voices/available?lang=es` lists the voices that speak a language, for information: you never pick one. VocalStack picks the voice that reads each speaker, and the only choice is whether cloned voices are used.

## 2. Ask for translations

`translate: ["es", "fr"]` on the session's options. Without sentences, each commit is followed by a `transcript.translated` frame naming its `seq`: attach `translations` to that segment. You can change the list mid-stream (`session.update`, `translate: […]`); it applies to what follows.

## 3. Read them by sentence

With `sentences: { enabled: true }`, the server also assembles commits into sentences and translates whole sentences, which reads far better. `transcript.sentence` is a full replacement of one sentence, keyed by `sentenceId`: `status` goes `open` → `closed` (or `dropped`: discard it), `seqs` lists the commits it covers, and `translations` are provisional while it is open and final once it closes. Upsert by `sentenceId`; never append.

## 4. Speak them

`voice: ["es"]` (it needs `sentences`) speaks each closed sentence's Spanish translation. VocalStack picks the voice: each speaker is read in a distinct stock voice of their gender or, with `voiceCloning` on, in their own consented cloned voice. That is the only choice: cloned or not. `"es:<voice id>"`, `voiceByLang` and `voiceCast` are accepted for compatibility and change nothing; each clip's `voice` says what read it. Each clip arrives as a `transcript.voice` frame: `sentenceId`, `lang`, `durationS`, and `audio`, the clip itself (base64 Ogg/Opus, 24 kHz mono). A long sentence comes in pieces (`part` of `parts`) so the first can play while the rest are made: play them back to back, in order.

```text
+0.0s {"type":"session.ready"}
+2.6s {"type":"transcript.committed","segment":{"seq":0,"start":0.0,"end":1.4,"text":"Good morning, everyone.","speaker":0,"words":[]}}
+2.7s {"type":"transcript.sentence","sentence":{"sentenceId":0,"status":"open","text":"Good morning, everyone.","seqs":[0],"speaker":0,"start":0.0,"end":1.4,"translations":{"es":"Buenos días a todos."}}}
+3.9s {"type":"transcript.sentence","sentence":{"sentenceId":0,"status":"closed","text":"Good morning, everyone.","seqs":[0],"speaker":0,"start":0.0,"end":1.4,"translations":{"es":"Buenos días a todos."}}}
+5.0s {"type":"transcript.voice","sentenceId":0,"generation":0,"lang":"es","voice":"es_ES-davefx-medium","format":"ogg","durationS":1.3,"synthS":0.4,"part":0,"parts":1,"voiceKey":"","audio":"T2dnUwACAAAA…"}
```

## 5. For a recording's listeners

A listener on the subscribe socket asks with `lang=es` (translations filtered to Spanish, [Listen](listen.md)); a clip reaches every listener on that language, synthesised once. VocalStack picks the voice, and the host's `settings.voiceCloning` says whether cloned voices are used; a `voice=` on the socket is ignored. A recording speaks only when its settings ask for it: `settings: { translationTts: true }` on the broadcast or transcription it is made in. `translationTts` is text-to-speech of translations only, off unless asked for: when on, every translation language a listener reads (up to the transcription's 10 translation languages, the same limit as translations) is spoken, live as each sentence lands and as a reading of the whole transcription once it has ended. A line already in the language picked plays its original audio; off, nothing is spoken. On a recording, `transcript.voice` carries a `url` instead of `audio`: fetch it with `GET /v1/recordings/{id}/voice/{sentence}?lang=es` (Ogg/Opus; `format=caf` for Apple). `transcript.voiceStatus` says when a voice is still `preparing` (its clips are held and will come) or `unavailable`. After the recording, `GET /v1/recordings/{id}/voice` lists every clip left behind, language by language, and `POST /v1/recordings/{id}/voice` reads the rest with `voices: "cloned"` (and `consent: true`) or `voices: "synthetic"`: the row whose `chosenFor` names that kind is the reading to play, its clips fetched with `voice=<voiceKey>`.

## Complete code

Each program runs as it is once `VOCALSTACK_API_KEY` holds one of your API keys.

### `translate.ts`

```typescript
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { VocalStack, applySentence, type SentenceSegment } from '@vocalstack/js-sdk';

const vs = new VocalStack({ baseUrl: 'https://api.vocalstack.com', apiKey: process.env.VOCALSTACK_API_KEY });

// For information: VocalStack picks the voice that reads each speaker.
const { voices } = await vs.voices.available('es');
if (voices.length === 0) throw new Error('no voice speaks Spanish');

// A file at full speed here; a microphone works the same (Stream a microphone).
const session = await vs.realtime.connect(
  {
    input: { kind: 'file' },
    spokenLanguage: 'en',
    translate: ['es'],
    sentences: { enabled: true },
    voice: ['es'],
  },
  {
    // The clips arrive as transcript.voice frames: onFrame sees every frame.
    onFrame: (f) => {
      if (f.type === 'transcript.voice' && f.audio) {
        void writeFile(`es-${f.sentenceId}-${f.part ?? 0}.ogg`, Buffer.from(f.audio, 'base64'));
      }
    },
  },
);
void session.sendFile(createReadStream('./talk.mp3'));

let sentences: SentenceSegment[] = [];
for await (const ev of session) {
  if (ev.type !== 'transcript.sentence') continue;
  sentences = applySentence(sentences, ev.sentence); // upsert by sentenceId
  if (ev.sentence.status === 'closed') console.log(`${ev.sentence.text}\n  es: ${ev.sentence.translations?.es}`);
}
console.log(`${sentences.length} sentences; the Spanish clips are es-<sentence>-<part>.ogg`);
```

---

The same guide for every SDK and for plain HTTP + WebSocket: https://api.vocalstack.com/docs/guides/translation-and-voices.md. Every guide: [docs/](./).
