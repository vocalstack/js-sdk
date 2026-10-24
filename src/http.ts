import { VocalStackError, fromEnvelope, fromOAuth } from './errors.js';

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface ClientOptions {
  /** API origin; `https://api.vocalstack.com` when absent. */
  baseUrl?: string;
  /** An API key (`vs_key_…`), on a server: keys are refused from web
   * pages.  Absent (and no `token`) = anonymous (a listener). */
  apiKey?: string;
  /** In a browser instead: a signed-in person's access token or a
   * short-lived browser token (`vs_bt_…`), or a getter so a refreshed one
   * is picked up per request.  Not with `apiKey`. */
  token?: string | (() => string | undefined | null | Promise<string | undefined | null>);
  /** Act for an organization the user belongs to (`X-Acting-Principal`). */
  actingPrincipal?: string;
  /** A stable per-device id (correlation only, `X-Device-Id`). */
  deviceId?: string;
  fetch?: typeof fetch;
  /** How often a `429 rate_limited`, or a `503 unavailable` on a call that
   * is safe to repeat (GET, HEAD, DELETE, or one with an `Idempotency-Key`),
   * is retried after its `Retry-After` (at most 60 s each).  Default 2; 0
   * turns it off. */
  maxRetries?: number;
  /** Default deadline for a realtime socket to report ready, in ms. */
  readyDeadlineMs?: number;
}

/** Per-call options every method takes last. */
export interface CallOptions {
  /** Sent as `Idempotency-Key` on the creates that honour it. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/** How a listener reads something that is not theirs: a private
 * broadcast's listener token, or a share link's code. */
export interface ReadAs {
  listenerToken?: string;
  shareCode?: string;
}

/** A listener-side read's query: the wire spells both as the options do
 * (`?listenerToken=`, `?shareCode=`), so this only picks them out. */
export function listenerQuery(as: ReadAs | undefined): Query {
  return { listenerToken: as?.listenerToken, shareCode: as?.shareCode };
}

export interface RequestInit2 extends CallOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  /** Send no credential even when the client has one. */
  anonymous?: boolean;
  /** Never retry, whatever the answer (a single-use code). */
  noRetry?: boolean;
  /** Read a 400 as OAuth's `{ error, error_description }`. */
  oauthErrors?: boolean;
}

export const DEFAULT_BASE_URL = 'https://api.vocalstack.com';

export function qs(q: Query | undefined): string {
  if (!q) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export const seg = (s: string | number) => encodeURIComponent(String(s));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The wait before retrying `503 unavailable` when it names none. */
const UNAVAILABLE_WAIT_S = 2;

/** Whether a failed call is retried after its `Retry-After` (up to
 * `maxRetries` times): `429 rate_limited` always (nothing ran), and
 * `503 unavailable` (the database is waking) only when repeating the call
 * cannot do the work twice: GET, HEAD and DELETE, or a call carrying an
 * `Idempotency-Key`. */
export function retries(status: number, code: string, method: string, idempotencyKey?: string): boolean {
  if (status === 429) return true;
  if (status !== 503 || code !== 'unavailable') return false;
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'DELETE' || !!idempotencyKey;
}

/** The one HTTP path every resource method goes through. */
export class Transport {
  readonly baseUrl: string;
  readonly opts: ClientOptions;
  readonly #fetch: typeof fetch;

  constructor(opts: ClientOptions) {
    this.baseUrl = (opts.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    if (opts.apiKey && opts.token) throw new TypeError('VocalStack: pass apiKey (a server) or token (a browser), not both');
    this.opts = opts;
    this.#fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** What goes in `Authorization: Bearer`: the API key, else the token. */
  async bearer(): Promise<string | undefined> {
    if (this.opts.apiKey) return this.opts.apiKey;
    const t = this.opts.token;
    const v = typeof t === 'function' ? await t() : t;
    return v ?? undefined;
  }

  url(path: string, query?: Query): string {
    return `${this.baseUrl}${path}${qs(query)}`;
  }

  wsUrl(path: string, query?: Query): string {
    return `${this.baseUrl.replace(/^http/, 'ws')}${path}${qs(query)}`;
  }

  /** The raw response, after error mapping.  Redirects are not followed
   * (`redirect: 'manual'`), so a 302 comes back as itself. */
  async raw(method: string, path: string, init: RequestInit2 = {}): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json', ...init.headers };
    const form = typeof FormData !== 'undefined' && init.body instanceof FormData;
    const urlencoded = init.body instanceof URLSearchParams;
    if (urlencoded) headers['content-type'] = 'application/x-www-form-urlencoded';
    else if (init.body !== undefined && !form) headers['content-type'] = 'application/json';
    const token = init.anonymous ? undefined : await this.bearer();
    if (token) headers.authorization = `Bearer ${token}`;
    if (this.opts.actingPrincipal) headers['x-acting-principal'] = this.opts.actingPrincipal;
    if (this.opts.deviceId) headers['x-device-id'] = this.opts.deviceId;
    if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey;
    const body =
      init.body === undefined ? undefined : form ? (init.body as FormData) : urlencoded ? String(init.body) : JSON.stringify(init.body);
    const maxRetries = init.noRetry ? 0 : (this.opts.maxRetries ?? 2);
    for (let attempt = 0; ; attempt++) {
      // No answer at all (offline, DNS, refused): a VocalStackError like
      // any other, with no address in its message; the cause is kept.
      let res: Response;
      try {
        res = await this.#fetch(this.url(path, init.query), {
          method,
          headers,
          body,
          redirect: 'manual',
          signal: init.signal,
        });
      } catch (e) {
        if ((e as { name?: string } | null)?.name === 'AbortError') throw e;
        const err = new VocalStackError('unavailable', 'could not reach the VocalStack API', { retryable: true });
        (err as { cause?: unknown }).cause = e;
        throw err;
      }
      if (res.ok || (res.status >= 300 && res.status < 400)) return res;
      const text = await res.text().catch(() => '');
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      const err = (init.oauthErrors ? fromOAuth : fromEnvelope)(json, res.status, res.headers);
      if (retries(res.status, err.code, method, init.idempotencyKey) && attempt < maxRetries) {
        // `unavailable` (a waking database) asks for Retry-After: 2; a
        // missing header means the same.
        const wait = err.retryAfter ?? (err.code === 'unavailable' ? UNAVAILABLE_WAIT_S : undefined);
        if (wait !== undefined && wait <= 60) {
          await sleep(wait * 1000);
          continue;
        }
      }
      throw err;
    }
  }

  /** A JSON call; an empty body resolves to `undefined`. */
  async json<T>(method: string, path: string, init: RequestInit2 = {}): Promise<T> {
    const res = await this.raw(method, path, init);
    if (res.status >= 300 && res.status < 400) return { location: res.headers.get('location') } as T;
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new VocalStackError('internal', 'the API answered with a body that is not JSON', { status: res.status, headers: res.headers, requestId: res.headers.get('x-request-id') ?? undefined });
    }
  }
}
