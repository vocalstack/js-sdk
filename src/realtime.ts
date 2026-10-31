import { parseServerFrame } from '@vocalstack/contract';
import type {
  Capabilities,
  CommittedSegment,
  CreateSessionResponse,
  Fix,
  LatencyMode,
  SentenceSegment,
  ServerFrame,
  SessionOptions,
  SessionStats,
  SpeakerLabels,
  WarmRequest,
} from '@vocalstack/contract';

import { capacityExceeded, fromEnvelope, VocalStackError } from './errors.js';
import { fileChunks, type FileInput } from './file.js';
import type { CallOptions, Transport } from './http.js';
import { openWebSocket, WS_OPEN, type WsLike } from './ws.js';

export type SessionEvent = Extract<
  ServerFrame,
  {
    type:
      | 'transcript.committed'
      | 'transcript.draft'
      | 'transcript.words'
      | 'transcript.translated'
      | 'transcript.amended'
      | 'transcript.latency'
      | 'transcript.speaker'
      | 'transcript.sentence'
      | 'transcript.progress';
  }
>;

export interface ConnectParams {
  sessionId: string;
  streamUrl: string;
  options?: SessionOptions;
  readyDeadlineMs?: number;
  onLoading?(stage: 'download' | 'model'): void;
  onFrame?(frame: ServerFrame): void;
}

const DEFAULT_READY_DEADLINE_MS = 30_000;

export function engineLost(closeCode?: number): VocalStackError {
  const how = closeCode ? ` (close ${closeCode})` : '';
  return new VocalStackError(
    'engine_lost',
    `The connection to the transcription engine closed before the realtime session finished${how}; open a new realtime session to continue.`,
    { retryable: true },
  );
}

export function upgradeRefused(status: number | undefined, body: string): VocalStackError {
  let parsed: unknown;
  try {
    parsed = body ? JSON.parse(body) : undefined;
  } catch {
    parsed = undefined;
  }
  if (status === 503) {
    const code = (parsed as { code?: unknown } | undefined)?.code;
    if (code === 'unavailable') return fromEnvelope(parsed, status);
    return capacityExceeded('stream host answered 503 (fleet saturated)');
  }
  const ours = typeof (parsed as { code?: unknown } | undefined)?.code === 'string';
  if ((status === 502 || status === 504) && !ours) return capacityExceeded(`stream host answered ${status} (no engine answered in time)`);
  return fromEnvelope(parsed, status);
}

export const RESTART_CLOSE = 1012;
const RESTART_TRIES = 3;
const MAX_PENDING_BYTES = 4 * 1024 * 1024;

async function openReady(
  url: string,
  deadlineMs: number,
  onLoading: ((stage: 'download' | 'model') => void) | undefined,
  onFrame: (frame: ServerFrame) => void,
  attach: (ws: WsLike) => void,
): Promise<void> {
  const ws = await openWebSocket(url);
  ws.binaryType = 'arraybuffer';
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let sawFrame = false;
    let rejecting = false;
    let timer: ReturnType<typeof setTimeout>;
    const fail = (err: VocalStackError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
      }
      reject(err);
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fail(
          sawFrame
            ? new VocalStackError(
                'engine_unavailable',
                `engine did not become ready within ${deadlineMs}ms`,
                { retryable: true },
              )
            : capacityExceeded(
                `no response from the engine within ${deadlineMs}ms — every machine is ` +
                  `busy with another session, or one is stuck holding a slot`,
              ),
        );
      }, deadlineMs);
    };
    arm();

    ws.addEventListener('message', (ev: any) => {
      if (settled || typeof ev.data !== 'string') return;
      sawFrame = true;
      arm();
      let frame: ServerFrame | null;
      try {
        frame = parseServerFrame(ev.data);
      } catch {
        return;
      }
      if (!frame) return;
      onFrame(frame);
      if (frame.type === 'session.loading') {
        onLoading?.(frame.stage);
      } else if (frame.type === 'session.ready') {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          attach(ws);
          resolve();
        }
      } else if (frame.type === 'error') {
        fail(
          new VocalStackError(frame.code, frame.message, {
            retryable: frame.retryable,
          }),
        );
      }
    });
    const emitterOn = (ws as unknown as { on?: (e: string, l: (...a: any[]) => void) => void })
      .on?.bind(ws);
    emitterOn?.('unexpected-response', (_req: unknown, res: any) => {
      rejecting = true;
      const status: number | undefined = res?.statusCode;
      let body = '';
      if (res && typeof res.on === 'function') {
        res.on('data', (c: Uint8Array) => (body += c.toString()));
        res.on('end', () => fail(upgradeRefused(status, body)));
      } else {
        fail(upgradeRefused(status, ''));
      }
    });
    ws.addEventListener('close', () => {
      if (rejecting) return;
      fail(
        new VocalStackError('engine_unavailable', 'connection closed before ready', {
          retryable: true,
        }),
      );
    });
    ws.addEventListener('error', () => {
    });
  });
}

export class RealtimeSession implements AsyncIterable<SessionEvent> {
  readonly sessionId: string;

  #ws: WsLike;
  #queue: SessionEvent[] = [];
  #wake: (() => void) | null = null;
  #endReason: 'eof' | 'max_duration' | 'cancelled' | null = null;
  #stats: SessionStats | null = null;
  #error: VocalStackError | null = null;
  #closed = false;
  #closedByUs = false;
  #onFrame: ((frame: ServerFrame) => void) | undefined;
  readonly #params: ConnectParams;
  #reconnecting = false;
  #pending: (string | Uint8Array | ArrayBuffer)[] = [];
  #pendingBytes = 0;
  #reconnects = 0;

  private constructor(sessionId: string, ws: WsLike, params: ConnectParams) {
    this.sessionId = sessionId;
    this.#ws = ws;
    this.#onFrame = params.onFrame;
    this.#params = params;
  }

  static async connect(params: ConnectParams): Promise<RealtimeSession> {
    const deadlineMs = params.readyDeadlineMs ?? DEFAULT_READY_DEADLINE_MS;
    const early: ServerFrame[] = [];
    let session: RealtimeSession | undefined;
    await openReady(params.streamUrl, deadlineMs, params.onLoading, (f) => early.push(f), (ws) => {
      const s = new RealtimeSession(params.sessionId, ws, params);
      for (const f of early) s.#frame(f);
      s.#listen();
      session = s;
    });
    return session!;
  }

  async #reconnect(code: number): Promise<void> {
    this.#reconnecting = true;
    const deadlineMs = this.#params.readyDeadlineMs ?? DEFAULT_READY_DEADLINE_MS;
    while (this.#reconnects < RESTART_TRIES && !this.#closedByUs) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** this.#reconnects));
      this.#reconnects++;
      if (this.#closedByUs) break;
      try {
        await openReady(this.#params.streamUrl, deadlineMs, this.#params.onLoading, (f) => this.#frame(f), (ws) => {
          this.#ws = ws;
          this.#reconnecting = false;
          this.#listen();
          const waiting = this.#pending;
          this.#pending = [];
          this.#pendingBytes = 0;
          for (const d of waiting) this.#send(d);
        });
        if (this.#closedByUs) this.close();
        return;
      } catch (e) {
        if (e instanceof VocalStackError && !e.retryable) {
          this.#fail(e);
          return;
        }
      }
    }
    this.#fail(engineLost(code));
  }

  #fail(err: VocalStackError): void {
    this.#reconnecting = false;
    this.#pending = [];
    this.#closed = true;
    if (!this.#endReason && !this.#error && !this.#closedByUs) this.#error = err;
    this.#wake?.();
  }

  #send(data: string | Uint8Array | ArrayBuffer): void {
    if (this.#reconnecting) {
      const n = typeof data === 'string' ? data.length : data.byteLength;
      if (this.#pendingBytes + n <= MAX_PENDING_BYTES) {
        this.#pending.push(data);
        this.#pendingBytes += n;
      }
      return;
    }
    if (this.#ws.readyState !== WS_OPEN) return;
    this.#ws.send(data);
  }

  #frame(frame: ServerFrame): void {
    try {
      this.#onFrame?.(frame);
    } catch {
    }
  }

  #listen(): void {
    const sock = this.#ws;
    sock.addEventListener('message', (ev: any) => {
      if (sock !== this.#ws || typeof ev.data !== 'string') return;
      let frame: ServerFrame | null;
      try {
        frame = parseServerFrame(ev.data);
      } catch {
        return;
      }
      if (!frame) return;
      this.#frame(frame);
      switch (frame.type) {
        case 'transcript.committed':
        case 'transcript.draft':
        case 'transcript.words':
        case 'transcript.translated':
        case 'transcript.amended':
        case 'transcript.latency':
        case 'transcript.speaker':
        case 'transcript.sentence':
        case 'transcript.progress':
          this.#queue.push(frame);
          this.#wake?.();
          break;
        case 'session.done':
          this.#endReason = frame.reason;
          this.#stats = frame.stats;
          this.#wake?.();
          break;
        case 'error':
          this.#error = new VocalStackError(frame.code, frame.message, {
            retryable: frame.retryable,
          });
          this.#wake?.();
          break;
        default:
          break;
      }
    });
    const ws = this.#ws;
    ws.addEventListener('close', (ev: any) => {
      if (ws !== this.#ws) return;
      const code = typeof ev?.code === 'number' ? ev.code : undefined;
      if (code === RESTART_CLOSE && !this.#endReason && !this.#error && !this.#closedByUs) {
        void this.#reconnect(code);
        return;
      }
      this.#closed = true;
      if (!this.#endReason && !this.#error && !this.#closedByUs) {
        this.#error = engineLost(code);
      }
      this.#wake?.();
    });
  }

  sendAudio(chunk: Float32Array | ArrayBuffer | Uint8Array): void {
    const data =
      chunk instanceof Float32Array
        ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        : chunk;
    this.#send(this.#reconnecting ? (data instanceof Uint8Array ? data.slice() : data.slice(0)) : data);
  }

  async sendFile(
    source: AsyncIterable<Uint8Array>,
    chunkBytes = 256 * 1024,
  ): Promise<void> {
    const MAX_BUFFERED = 4 * 1024 * 1024;
    for await (const chunk of source) {
      for (let off = 0; off < chunk.byteLength; off += chunkBytes) {
        while (this.#reconnecting) await new Promise((r) => setTimeout(r, 50));
        if (this.#ws.readyState !== WS_OPEN) return;
        while ((this.#ws as any).bufferedAmount > MAX_BUFFERED) {
          await new Promise((r) => setTimeout(r, 10));
          if (this.#ws.readyState !== WS_OPEN && !this.#reconnecting) return;
        }
        this.#send(chunk.subarray(off, Math.min(off + chunkBytes, chunk.byteLength)));
      }
    }
    this.eof();
  }

  async pipe(
    source: AsyncIterable<Float32Array | ArrayBuffer | Uint8Array> | ReadableStream<Uint8Array>,
  ): Promise<void> {
    const iter: AsyncIterable<Float32Array | ArrayBuffer | Uint8Array> =
      Symbol.asyncIterator in source
        ? (source as AsyncIterable<Float32Array | ArrayBuffer | Uint8Array>)
        : readableToAsyncIterable(source as ReadableStream<Uint8Array>);
    for await (const chunk of iter) {
      this.sendAudio(chunk);
    }
    this.eof();
  }

  sendClock(pcm: number, wall: number): void {
    this.#send(JSON.stringify({ type: 'clock', pcm: Math.floor(pcm), wall }));
  }

  update(changes: {
    latencyMode?: LatencyMode;
    spokenLanguage?: string;
    speakerLabels?: SpeakerLabels;
    translate?: string[];
  }): void {
    this.#send(
      JSON.stringify({
        type: 'session.update',
        ...(changes.latencyMode !== undefined && { latencyMode: changes.latencyMode }),
        ...(changes.spokenLanguage !== undefined && { spokenLanguage: changes.spokenLanguage }),
        ...(changes.speakerLabels !== undefined && { speakerLabels: changes.speakerLabels }),
        ...(changes.translate !== undefined && { translate: changes.translate }),
      }),
    );
  }

  eof(): void {
    this.#send(JSON.stringify({ type: 'eof' }));
  }

  cancel(): void {
    this.#send(JSON.stringify({ type: 'cancel' }));
  }

  get doneReason(): 'eof' | 'max_duration' | 'cancelled' | null {
    return this.#endReason;
  }

  get stats(): SessionStats | null {
    return this.#stats;
  }

  close(): void {
    this.#closed = true;
    this.#closedByUs = true;
    try {
      this.#ws.close();
    } catch {
    }
    this.#wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SessionEvent> {
    for (;;) {
      const item = this.#queue.shift();
      if (item) {
        yield item;
        continue;
      }
      if (this.#error) throw this.#error;
      if (this.#endReason || this.#closed) return;
      await new Promise<void>((resolve) => {
        this.#wake = resolve;
      });
      this.#wake = null;
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

async function* readableToAsyncIterable(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export interface ConnectOptions {
  onLoading?(stage: 'download' | 'model'): void;
  onFrame?(frame: ServerFrame): void;
  readyDeadlineMs?: number;
}

export interface TranscribeOptions extends Omit<SessionOptions, 'input' | 'audio'> {
  onSession?(session: RealtimeSession): void;
  onProgress?(progress: { processedS: number; totalS?: number }): void;
  onCommit?(segment: CommittedSegment): void;
  onTranslated?(seq: number, translations: Record<string, string>, sources?: Record<string, string>): void;
  onAmended?(seq: number, text: string, speaker: number, fixes: Fix[]): void;
  onSpeakerSettled?(seq: number, speaker: number, verdict: string, confidence?: number): void;
  onSentence?(sentence: SentenceSegment): void;
  readyDeadlineMs?: number;
}

export interface RealtimeTranscript {
  segments: CommittedSegment[];
  sentences: SentenceSegment[];
  text: string;
  doneReason: 'eof' | 'max_duration' | 'cancelled' | null;
  stats: SessionStats | null;
}

export class Realtime {
  readonly #t: Transport;

  constructor(t: Transport) {
    this.#t = t;
  }

  createSession(options: SessionOptions = {}, call: CallOptions = {}): Promise<CreateSessionResponse> {
    return this.#t.json('POST', '/v1/realtime/sessions', { body: options, ...call });
  }

  async connect(options: SessionOptions = {}, connect: ConnectOptions = {}): Promise<RealtimeSession> {
    const created = await this.createSession(options);
    return RealtimeSession.connect({
      sessionId: created.sessionId,
      streamUrl: created.streamUrl,
      options,
      readyDeadlineMs: connect.readyDeadlineMs ?? this.#t.opts.readyDeadlineMs,
      onLoading: connect.onLoading,
      onFrame: connect.onFrame,
    });
  }

  capabilities(): Promise<Capabilities> {
    return this.#t.json('GET', '/v1/realtime/capabilities');
  }

  async warm(req: WarmRequest): Promise<void> {
    await this.#t.json('POST', '/v1/realtime/warm', { body: req });
  }

  async transcribeFile(file: FileInput, opts: TranscribeOptions = {}): Promise<RealtimeTranscript> {
    const { onSession, readyDeadlineMs, handlers, options } = split(opts);
    const session = await this.connect({ ...options, input: { kind: 'file' } }, { readyDeadlineMs });
    onSession?.(session);
    await session.sendFile(fileChunks(file));
    return collectTranscript(session, handlers);
  }

  async transcribeUrl(url: string, opts: TranscribeOptions = {}): Promise<RealtimeTranscript> {
    const { onSession, readyDeadlineMs, handlers, options } = split(opts);
    const session = await this.connect({ ...options, input: { kind: 'url', url } }, { readyDeadlineMs });
    onSession?.(session);
    return collectTranscript(session, handlers);
  }
}

type Handlers = Pick<
  TranscribeOptions,
  'onProgress' | 'onCommit' | 'onTranslated' | 'onAmended' | 'onSpeakerSettled' | 'onSentence'
>;

function split(opts: TranscribeOptions) {
  const {
    onProgress,
    onCommit,
    onSession,
    onTranslated,
    onAmended,
    onSpeakerSettled,
    onSentence,
    readyDeadlineMs,
    ...options
  } = opts;
  const handlers: Handlers = { onProgress, onCommit, onTranslated, onAmended, onSpeakerSettled, onSentence };
  return { onSession, readyDeadlineMs, handlers, options };
}

export function applySentence(list: SentenceSegment[], sentence: SentenceSegment): SentenceSegment[] {
  const i = list.findIndex((s) => s.sentenceId === sentence.sentenceId);
  if (sentence.status === 'dropped') {
    return i === -1 ? list : [...list.slice(0, i), ...list.slice(i + 1)];
  }
  if (i === -1) {
    const next = [...list, sentence];
    next.sort((a, b) => a.sentenceId - b.sentenceId);
    return next;
  }
  const next = list.slice();
  next[i] = sentence;
  return next;
}

async function collectTranscript(session: RealtimeSession, h: Handlers): Promise<RealtimeTranscript> {
  const segments: CommittedSegment[] = [];
  let sentences: SentenceSegment[] = [];
  for await (const event of session) {
    if (event.type === 'transcript.committed') {
      segments.push(event.segment);
      h.onCommit?.(event.segment);
    } else if (event.type === 'transcript.translated') {
      const seg = segments.find((s) => s.seq === event.seq);
      if (seg) {
        seg.translations = event.translations;
        seg.translationSources = event.sources;
      }
      h.onTranslated?.(event.seq, event.translations, event.sources ?? undefined);
    } else if (event.type === 'transcript.amended') {
      const seg = segments.find((s) => s.seq === event.seq);
      if (seg) {
        seg.text = event.text;
        if (event.speaker >= 0) seg.speaker = event.speaker;
      }
      h.onAmended?.(event.seq, event.text, event.speaker, event.fixes ?? []);
    } else if (event.type === 'transcript.latency') {
      const seg = segments.find((s) => s.seq === event.seq);
      if (seg) seg.latencyS = event.latencyS;
    } else if (event.type === 'transcript.speaker') {
      const seg = segments.find((s) => s.seq === event.seq);
      if (seg) {
        if (event.speaker >= 0) seg.speaker = event.speaker;
        if (event.speakerConfidence != null) seg.speakerConfidence = event.speakerConfidence;
        seg.speakerProvisional = false;
      }
      h.onSpeakerSettled?.(event.seq, event.speaker, event.verdict, event.speakerConfidence ?? undefined);
    } else if (event.type === 'transcript.sentence') {
      sentences = applySentence(sentences, event.sentence);
      h.onSentence?.(event.sentence);
    } else if (event.type === 'transcript.progress') {
      h.onProgress?.({ processedS: event.processedS, totalS: event.totalS ?? undefined });
    }
  }
  return {
    segments,
    sentences,
    text: (sentences.length ? sentences : segments).map((s) => s.text).join(' '),
    doneReason: session.doneReason,
    stats: session.stats,
  };
}
