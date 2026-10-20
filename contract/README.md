# @vocalstack/contract

The VocalStack API's contract, generated from the API: `contract.json`
(OpenAPI for HTTP, plus the realtime WebSocket frames) and the zod schemas
in `src/` that the SDK validates against. `npm run build` here (the SDK's
build runs it first) compiles them to `dist/`. Every change to the API's
`/v1` surface is in `CHANGELOG.md`.

Generated: changes made here are overwritten by the next release.
