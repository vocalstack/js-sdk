<!-- Generated from https://api.vocalstack.com/docs/guides/connect-an-app.md; edits here are overwritten. -->

# Connect an app with one click

> Let the people who use your app connect their VocalStack account with one Authenticate click — OAuth 2.0 authorization code with PKCE, where the access token is an API key — instead of pasting a key.

| Endpoint | What it does |
|---|---|
| `POST /v1/connect/token` | Redeem a connect code |
| `GET /v1/me` | Get the current account |

If your app runs on your users' own servers (a CMS plugin, a self-hosted tool), each of them needs an API key for their own VocalStack account. One-click Connect gets it for them: your app opens VocalStack's dashboard, the person signs in and clicks **Authenticate**, and your server receives a key named after your app. Nobody copies a key, and the key never passes through a browser.

It is OAuth 2.0's authorization code flow with PKCE (RFC 7636, `S256` only), and the access token it issues is an ordinary API key. There is nothing to register: the consent screen shows the person the host of your `redirect_uri`, so they can tell whose server will hold the key.

1. You → VocalStack: `open {dashboard}/connect?response_type=code&client_name=…&redirect_uri=…&state=…&code_challenge=…&code_challenge_method=S256&scope=read write` (in a new tab)
2. VocalStack → you: `the consent screen: sign in, pick the account, Authenticate` (owners and admins only)
3. VocalStack → you: `redirect_uri?code=…&state=…` (or ?error=access_denied&state=… on Cancel)
4. You → VocalStack: `POST /v1/connect/token  grant_type=authorization_code, code, code_verifier, redirect_uri` (from your server)
5. VocalStack → you: `{ access_token: "vs_key_…", token_type: "api_key", key_id, scope, reach, account: { name } }`

## 1. Send the person to the consent screen

Make a random `state` and a PKCE verifier (43 to 128 characters of `A-Z a-z 0-9 - . _ ~`; 32 or more random bytes, base64url-encoded, are right), keep both on your server for a few minutes, and open the dashboard's `/connect` page with:

| Parameter | Value |
|---|---|
| `response_type` | `code` |
| `client_name` | Your app as the person will recognise it, at most 100 characters: `drbc.org (Payload CMS)`. The key is named after it. |
| `redirect_uri` | Where the dashboard sends the browser back to: absolute `https`, or `http` for `localhost` / `127.0.0.1` while you develop. No fragment. |
| `state` | Your random value; it comes back unchanged. |
| `code_challenge` | `BASE64URL(SHA256(verifier))`, without padding (43 characters). |
| `code_challenge_method` | `S256` |
| `scope` | `read`, `write` or `read write`. An app on the person's computer (a `localhost` / `127.0.0.1` redirect) may add `recordings:publish`, with `write`, to start and stop recordings. Keys with full access, or a web app's key with `recordings:publish`, are made by hand in the dashboard. |
| `reach` | Optional. `own` (the default with `write`): the key reaches only what your app creates with it, its transcriptions and broadcasts and everything in them; the account's other ones answer `404`. `account`: everything on the account, whoever made it (the default, and the only reach, without `write`). |

A link that breaks a rule gets an error page and never redirects, so check it while you build.

## 2. The person authenticates

The dashboard asks the person to sign in if they are not, then shows your `redirect_uri`'s host (and whether it is https or a site on their own computer), the name you sent (marked as not checked), the account the key will act for — they choose when they belong to several — what the scopes allow and what the key reaches. Only owners and admins of an organization can connect an app to it.

**Authenticate** sends the browser to `redirect_uri?code=…&state=…`. **Cancel** sends it to `redirect_uri?error=access_denied&state=…`. Either way, check `state` against the one you kept before you do anything else.

## 3. Redeem the code on your server

Within two minutes, post the code with the verifier and the same `redirect_uri` to `POST /v1/connect/token`, form-encoded, from your server. No API key is needed: the code and its verifier are the proof. The answer carries the key (`access_token`), its id, the granted `scope`, its `reach` and the account's name; store the key as you would one your user pasted. It is shown once, in this answer.

A code works once. A second redemption, a wrong verifier, a different `redirect_uri` or an expired code answers `400` with `{"error": "invalid_grant", "error_description": "…"}` (and spends the code); a missing or repeated parameter is `invalid_request`, any `grant_type` but `authorization_code` is `unsupported_grant_type`. A request from a web page is refused: keys are for servers.

## 4. Afterwards

The key is listed in Developers → API keys under your `client_name`, marked as a connected app, where the person can revoke it. Use it like any key: `GET /v1/me` says who it is. Connecting again makes a new key and leaves the old one working until it is revoked, so revoke the key you replace, or let the person do it. An app that streams to the account over RTMP makes a stream key of its own with `POST /v1/rtmp/keys`; it works while the app's key does, so revoking the app stops its stream too.

## Complete code

Each program runs as it is once `VOCALSTACK_API_KEY` holds one of your API keys.

### `connect.ts`

```typescript
import { createHash, randomBytes } from 'node:crypto';
import { VocalStack } from '@vocalstack/js-sdk';

const DASHBOARD = process.env.VOCALSTACK_DASHBOARD_URL ?? 'https://app.vocalstack.com';
const REDIRECT_URI = 'https://example.com/api/vocalstack/callback';
// One sign-in in flight; keep these in your session store instead.
const pending = new Map<string, string>();

export function connectUrl(): string {
  const state = randomBytes(24).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  pending.set(state, verifier);
  const url = new URL('/connect', DASHBOARD);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_name: 'example.com (My CMS)',
    redirect_uri: REDIRECT_URI,
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope: 'read write',
  }).toString();
  return url.toString();
}

export async function callback(query: URLSearchParams): Promise<string> {
  const verifier = pending.get(query.get('state') ?? '');
  pending.delete(query.get('state') ?? '');
  if (!verifier) throw new Error('unknown or reused state');
  if (query.get('error')) throw new Error(`not connected: ${query.get('error')}`);

  const vs = new VocalStack({ baseUrl: 'https://api.vocalstack.com' });
  const token = await vs.connect.token({ code: query.get('code') ?? '', codeVerifier: verifier, redirectUri: REDIRECT_URI });
  console.log(`connected to ${token.account.name} (${token.scope})`);

  const me = await new VocalStack({ baseUrl: 'https://api.vocalstack.com', apiKey: token.access_token }).me.get();
  console.log(me.apiKeyId === token.key_id);
  return token.access_token;
}
```

---

The same guide for every SDK and for plain HTTP + WebSocket: https://api.vocalstack.com/docs/guides/connect-an-app.md. Every guide: [docs/](./).
