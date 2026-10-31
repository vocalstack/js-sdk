import type { ErrorCode } from '@vocalstack/contract';

export type ConnectTokenErrorCode = 'invalid_request' | 'invalid_grant' | 'unsupported_grant_type';

export interface VocalStackErrorOptions {
  retryable?: boolean;
  status?: number;
  details?: unknown;
  headers?: Headers;
  requestId?: string;
}

export class VocalStackError extends Error {
  readonly code: ErrorCode | ConnectTokenErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly details?: unknown;
  readonly headers?: Headers;
  readonly requestId?: string;

  constructor(code: ErrorCode | ConnectTokenErrorCode, message: string, opts: VocalStackErrorOptions = {}) {
    super(message);
    this.name = 'VocalStackError';
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.status = opts.status;
    this.details = opts.details;
    this.headers = opts.headers;
    this.requestId = opts.requestId;
  }

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

export function fromOAuth(body: unknown, status?: number, headers?: Headers): VocalStackError {
  const b = body as { error?: string; error_description?: string } | undefined;
  if (status === 400 && b && typeof b.error === 'string') {
    return new VocalStackError(b.error as ConnectTokenErrorCode, b.error_description ?? b.error, {
      status,
      headers,
      requestId: headers?.get('x-request-id') ?? undefined,
    });
  }
  return fromEnvelope(body, status, headers);
}
