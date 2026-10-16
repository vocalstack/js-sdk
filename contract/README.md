# @vocalstack/contract

Generated contract for the VocalStack API: one public version, `/v1`.

- `contract.json` — the one public document, checked in and diff-gated:
  OpenAPI 3.1 for every `/v1` HTTP route, JSON Schemas for the WebSocket
  frames and the error envelope, and one `x-websocket` entry per socket
  (`realtimeSession`, `subscribe`, `broadcastEvents`, `transcriptionEvents`, `accountEvents`).
  Generated FROM the Rust server's types by `vs-transcribe contract`
  (`make contract` at the repo root): each route's OpenAPI sits beside its
  handler in `src/http/v1/`, and a manifest test checks the document
  against the public routes both ways, so the server cannot drift from
  this file. The server serves the same document at `/v1/openapi.json`.
- `src/` — fully generated TypeScript (do not edit): zod schemas for every
  component and WS frame types with a forward-compatible `parseServerFrame`
  helper. There is no client here: `@vocalstack/sdk` is the one TypeScript
  client, built on these types.
- `tools/generate.mjs` — the in-house generator (contract.json → TS +
  pydantic models for the Python SDK, `sdks/python/src/vocalstack/_models.py`).
  It fails loudly on schema shapes it doesn't know, so contract growth is a
  conscious generator change, not silent drift.

First-party (`/app`), admin and internal routes are never in this document.

`make contract-artifacts-check` regenerates `src/` and the Python models
into a scratch directory and fails on drift (pure Node; CI runs it).

Any change to `contract.json` is an API change — review it as one, and add
a `CHANGELOG.md` entry (`make contract-changelog-check`). Inside `/v1` only
additive changes are allowed; anything else needs a new major path.
