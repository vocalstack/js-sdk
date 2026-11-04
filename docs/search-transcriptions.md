<!-- Generated from https://api.vocalstack.com/docs/guides/search-transcriptions.md; edits here are overwritten. -->

# Search your transcriptions

> Find transcriptions by words in their name or link, site, language, kind, tag and date, keep the shared ones, and play each with its share code.

| Endpoint | What it does |
|---|---|
| `GET /v1/transcriptions` | List transcriptions |
| `POST /v1/transcriptions/{id}/share-links` | Create a share link |

`GET /v1/transcriptions` takes the same filters as the dashboard's search: give any of them and every one must match. The server filters before it pages, so `total` is the number of matches and `nextCursor` pages through matches only.

## 1. Filter the list

| Parameter | Keeps |
|---|---|
| `q` | Every word in the name, the source's name or its link, in any case: `q=team meeting` |
| `site` | Links from that site, by its id: `youtube`, `vimeo`, `loom`, `soundcloud`, `twitch`… |
| `language` | That spoken language, set or detected: `en`, `es`… |
| `kind` | `file` (an upload), `link` (a URL) or `live` (a microphone or a stream) |
| `tag` | That tag, by its id or its name (`tags.list`) |
| `origin` | Where it was made: `dashboard`, `api`, `extension`… |
| `broadcast` | The live transcriptions feeding that broadcast, by its id |
| `createdAfter`, `createdBefore` | An RFC 3339 time, or a `YYYY-MM-DD` date for the whole day (UTC) |
| `lifecycle` | `active` (the default), `archived` or `all` |

`GET /v1/transcriptions?q=interview&site=youtube&language=en&createdAfter=2026-01-01` is every English YouTube interview made this year. A value that does not parse (a `kind` of `video`, a date of `yesterday`) is `400 invalid_options`. In the SDKs, `list()` reads every page of matches and `listPage()` reads one.

## 2. Keep the shared ones

`shared=true` keeps the transcriptions with a live share link, and each one carries `shareCode`, the code of its newest link. `shared=false` keeps those with none. A transcription gets a share link when it is created with `shareLink: true`, from the dashboard's Share button, or from `POST /v1/transcriptions/{id}/share-links`. A revoked link no longer counts.

## 3. Play them

A share code plays in the open-source [`@vocalstack/player`](https://github.com/vocalstack/player) with no key, so the page that lists your videos needs no credential. Call the API on your server, where the API key stays, and send the page only the codes:

```tsx
import { VocalStackPlayer } from '@vocalstack/player'
import '@vocalstack/player/style.css'

export function Videos({ codes }: { codes: string[] }) {
  return codes.map((code) => <VocalStackPlayer key={code} id={code} />)
}
```

Anyone with a share code can open that transcript at `/v1/shares/{code}`: share only what you mean to publish.

## Complete code

Each program runs as it is once `VOCALSTACK_API_KEY` holds one of your API keys.

### `search.ts`

```typescript
import { VocalStack } from '@vocalstack/js-sdk';

const vs = new VocalStack({ baseUrl: 'https://api.vocalstack.com', apiKey: process.env.VOCALSTACK_API_KEY });

const page = await vs.transcriptions.listPage({ q: 'interview', site: 'youtube', language: 'en', createdAfter: '2026-01-01', limit: 20 });
console.log(`${page.total} match`);

const videos = await vs.transcriptions.list({ shared: true, q: 'interview', site: 'youtube' });

const codes = videos.map((v) => v.shareCode!);
console.log(codes);
```

---

The same guide for every SDK and for plain HTTP + WebSocket: https://api.vocalstack.com/docs/guides/search-transcriptions.md. Every guide: [docs/](./).
