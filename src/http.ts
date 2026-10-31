import { VocalStackError, fromEnvelope, fromOAuth } from './errors.js';

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface ClientOptions {
  baseUrl?: string;
  apiKey?: string;
  token?: string | (() => string | undefined | null | Promise<string | undefined | null>);
  actingPrincipal?: string;
  deviceId?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  readyDeadlineMs?: number;
}

export interface CallOptions {
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ReadAs {
  listenerToken?: string;
  shareCode?: string;
}

export function listenerQuery(as: ReadAs | undefined): Query {
  return { listenerToken: as?.listenerToken, shareCode: as?.shareCode };
}

export interface RequestInit2 extends CallOptions {
  query?: Query;
  body?: unknown;
  headers?: Record<string, string>;
  anonymous?: boolean;
  noRetry?: boolean;
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

const UNAVAILABLE_WAIT_S = 2;

export function retries(status: number, code: string, method: string, idempotencyKey?: string): boolean {
  if (status === 429) return true;
  if (status !== 503 || code !== 'unavailable') return false;
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'DELETE' || !!idempotencyKey;
}

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
        const wait = err.retryAfter ?? (err.code === 'unavailable' ? UNAVAILABLE_WAIT_S : undefined);
        if (wait !== undefined && wait <= 60) {
          await sleep(wait * 1000);
          continue;
        }
      }
      throw err;
    }
  }

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
