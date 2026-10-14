import type { ErrorCode } from '@vocalstack/contract';

export interface VocalStackErrorOptions {
  retryable?: boolean;
  status?: number;
  details?: unknown;
  headers?: Headers;
  requestId?: string;
}

/** Every failure this SDK surfaces: an HTTP error envelope, a socket
 * `error` frame, or one the transport synthesizes (`capacity_exceeded`). */
export class VocalStackError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  /** HTTP status, when the error came from an HTTP response. */
  readonly status?: number;
  /** The envelope's `data.details`: for example `{ balance, required,
   * plan, topUpUrl }` on `insufficient_credit`, code suggestions on a
   * link conflict, `{ recordingId, takeover: true }` when another device
   * is recording. */
  readonly details?: unknown;
  /** The response headers (`Retry-After`, `RateLimit-*`,
   * `WWW-Authenticate`), when the error came from an HTTP response. */
  readonly headers?: Headers;
  /** The request's id (the envelope's `requestId`, else the `X-Request-Id`
   * header): quote it when reporting a failure. */
  readonly requestId?: string;

  constructor(code: ErrorCode, message: string, opts: VocalStackErrorOptions = {}) {
    super(message);
    this.name = 'VocalStackError';
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.status = opts.status;
    this.details = opts.details;
    this.headers = opts.headers;
    this.requestId = opts.requestId;
  }

  /** Seconds the server asked the caller to wait (`Retry-After`), if it said. */
  get retryAfter(): number | undefined {
    const v = this.headers?.get('retry-after');
    if (v == null || v === '') return undefined;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const at = Date.parse(v);
    return Number.isNaN(at) ? undefined : Math.max(0, (at - Date.now()) / 1000);
  }
}

export function capacityExceeded(message: string): VocalStackError {
  return new VocalStackError('capacity_exceeded', message, { retryable: true });
}

export function fromEnvelope(body: unknown, status?: number, headers?: Headers): VocalStackError {
  const b = body as
    | { code?: ErrorCode; message?: string; requestId?: string; data?: { retryable?: boolean; details?: unknown } }
    | undefined;
  // The envelope names the request; a header the page cannot read across
  // origins (when it is not exposed) is the fallback.
  const requestId = (b && typeof b.requestId === 'string' ? b.requestId : undefined) ?? headers?.get('x-request-id') ?? undefined;
  if (b && typeof b.code === 'string') {
    return new VocalStackError(b.code, b.message ?? b.code, {
      retryable: b.data?.retryable ?? false,
      status,
      details: b.data?.details,
      headers,
      requestId,
    });
  }
  return new VocalStackError('internal', `unexpected error (status ${status})`, { status, headers, requestId });
}
