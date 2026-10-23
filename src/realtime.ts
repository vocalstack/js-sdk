/**
 * The realtime session: `Realtime` (`vs.realtime`: create a session, or
 * transcribe a file or a URL over one) and `RealtimeSession` (its socket).
 */
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
  /** Fires on every `session.loading` frame while the engine warms up
   * (model download / load after a machine wake) — lets a UI show
   * "warming up" instead of a generic connecting state.  Each frame also
   * re-arms the ready deadline, so a long cold load only fails once the
   * engine goes silent, not merely slow. */
  onLoading?(stage: 'download' | 'model'): void;
  /** Every server text frame as it arrives, parsed, before the iterator
   * sees it: the lifecycle frames the iterator keeps to itself
   * (`session.loading`, `session.ready`, `session.done`, `error`) and the
   * transcript frames alike.  For logs and protocol views; the iterator
   * is still the way to read the transcript. */
  onFrame?(frame: ServerFrame): void;
}

const DEFAULT_READY_DEADLINE_MS = 30_000;

/** A ready socket that closed with neither `session.done` nor an `error`
 * frame, and not by `close()`: the engine went away mid-stream (its
 * machine stopped or crashed) or the connection to it dropped.  What was
 * committed before stays; nothing after it was transcribed.  Retryable:
 * open a new realtime session to go on (there is no resume). */
export function engineLost(closeCode?: number): VocalStackError {
  const how = closeCode ? ` (close ${closeCode})` : '';
  return new VocalStackError(
    'engine_lost',
    `The connection to the transcription engine closed before the realtime session finished${how}; open a new realtime session to continue.`,
    { retryable: true },
  );
}

/** A refused socket upgrade as an error.  A 503 carrying the error body
 * with `unavailable` (the database is waking; retry shortly) says so; any
 * other 503 — a bare one from a saturated proxy, or no body at all — is
 * `capacity_exceeded`.  So is a 502 or 504 without the API's error body:
 * the proxy in front of the engines found none free in time.  Every other
 * status is its own envelope. */
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

export class RealtimeSession implements AsyncIterable<SessionEvent> {
  readonly sessionId: string;

  #ws: WsLike;
  #queue: SessionEvent[] = [];
  #wake: (() => void) | null = null;
  #endReason: 'eof' | 'max_duration' | 'cancelled' | null = null;
  #stats: SessionStats | null = null;
  #error: VocalStackError | null = null;
  #closed = false;
  /** `close()` was called: the socket's end is ours, not a lost engine. */
  #closedByUs = false;
  #onFrame: ((frame: ServerFrame) => void) | undefined;

  private constructor(sessionId: string, ws: WsLike, onFrame?: (frame: ServerFrame) => void) {
    this.sessionId = sessionId;
    this.#ws = ws;
    this.#onFrame = onFrame;
  }

  static async connect(params: ConnectParams): Promise<RealtimeSession> {
    const deadlineMs = params.readyDeadlineMs ?? DEFAULT_READY_DEADLINE_MS;
    const ws = await openWebSocket(params.streamUrl);
    ws.binaryType = 'arraybuffer';
    const session = new RealtimeSession(params.sessionId, ws, params.onFrame);

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
        // Once ready, #listen reads the socket; this one stops re-arming
        // the deadline (it used to leave a timer running for 30 s).
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
        session.#frame(frame);
        if (frame.type === 'session.loading') {
          params.onLoading?.(frame.stage);
        } else if (frame.type === 'session.ready') {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            session.#listen();
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
        // No HTTP answer at all (a refused upgrade is `unexpected-response`
        // above): the connection dropped on the way, as the Python and PHP
        // SDKs say it — retryable, not a bad token.
        fail(
          new VocalStackError('engine_unavailable', 'connection closed before ready', {
            retryable: true,
          }),
        );
      });
      ws.addEventListener('error', () => {
      });
    });
    return session;
  }

  /** Hands a frame to `onFrame`; a throwing callback never breaks the socket. */
  #frame(frame: ServerFrame): void {
    try {
      this.#onFrame?.(frame);
    } catch {
    }
  }

  #listen(): void {
    this.#ws.addEventListener('message', (ev: any) => {
      if (typeof ev.data !== 'string') return;
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
    this.#ws.addEventListener('close', (ev: any) => {
      this.#closed = true;
      // Closed under us before the session said how it ended: not a
      // silent end of the transcript, the engine was lost.
      if (!this.#endReason && !this.#error && !this.#closedByUs) {
        this.#error = engineLost(typeof ev?.code === 'number' ? ev.code : undefined);
      }
      this.#wake?.();
    });
  }

  sendAudio(chunk: Float32Array | ArrayBuffer | Uint8Array): void {
    if (this.#ws.readyState !== WS_OPEN) return;
    const data =
      chunk instanceof Float32Array
        ? new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)
        : chunk;
    this.#ws.send(data);
  }

  async sendFile(
    source: AsyncIterable<Uint8Array>,
    chunkBytes = 256 * 1024,
  ): Promise<void> {
    const MAX_BUFFERED = 4 * 1024 * 1024;
    for await (const chunk of source) {
      for (let off = 0; off < chunk.byteLength; off += chunkBytes) {
        if (this.#ws.readyState !== WS_OPEN) return;
        while ((this.#ws as any).bufferedAmount > MAX_BUFFERED) {
          await new Promise((r) => setTimeout(r, 10));
          if (this.#ws.readyState !== WS_OPEN) return;
        }
        this.#ws.send(chunk.subarray(off, Math.min(off + chunkBytes, chunk.byteLength)));
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

  /**
   * Capture clock heartbeat: `pcm` = cumulative samples captured so far
   * (16kHz-equivalent), `wall` = seconds since capture start.  Lets the
   * server detect capture loss (throttled tab, device switch) and mark
   * the transcript with honest gaps instead of gluing across them.
   * `streamMicrophone`/`captureMicrophone` call this automatically.
   */
  sendClock(pcm: number, wall: number): void {
    if (this.#ws.readyState === WS_OPEN) {
      this.#ws.send(JSON.stringify({ type: 'clock', pcm: Math.floor(pcm), wall }));
    }
  }

  /**
   * Options update during the realtime session. Omitted fields are unchanged.
   * `latencyMode` switches the decode model policy from the next
   * engine step; `spokenLanguage` changes the transcription language from the
   * next engine step (`''` or `'auto'` = auto-detect); `speakerLabels`
   * turns speaker labelling on (`'on'` or `'auto'`) or off (`'off'`) from the next
   * engine step — enabling labels speakers from that point on;
   * `translate` replaces the whole target-language list (`[]` turns
   * translation off). Applies to subsequent transcript —
   * already-delivered segments and settled sentences are not
   * re-transcribed, re-attributed or re-translated.
   */
  update(changes: {
    latencyMode?: LatencyMode;
    spokenLanguage?: string;
    speakerLabels?: SpeakerLabels;
    translate?: string[];
  }): void {
    if (this.#ws.readyState !== WS_OPEN) return;
    this.#ws.send(
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
    if (this.#ws.readyState === WS_OPEN) {
      this.#ws.send(JSON.stringify({ type: 'eof' }));
    }
  }

  cancel(): void {
    if (this.#ws.readyState === WS_OPEN) {
      this.#ws.send(JSON.stringify({ type: 'cancel' }));
    }
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
  /** See {@link ConnectParams.onLoading}: engine warm-up progress. */
  onLoading?(stage: 'download' | 'model'): void;
  /** See {@link ConnectParams.onFrame}: every server frame, lifecycle included. */
  onFrame?(frame: ServerFrame): void;
  /** Overrides the client-wide `readyDeadlineMs` for this socket. */
  readyDeadlineMs?: number;
}

export interface TranscribeOptions extends Omit<SessionOptions, 'input' | 'audio'> {
  /** The realtime session, once connected (to `cancel()` it, say). */
  onSession?(session: RealtimeSession): void;
  onProgress?(progress: { processedS: number; totalS?: number }): void;
  onCommit?(segment: CommittedSegment): void;
  /** A committed segment's translation arrived; the segment (by `seq`)
   * already has its `translations` filled in. */
  onTranslated?(seq: number, translations: Record<string, string>, sources?: Record<string, string>): void;
  /** The engine rewrote a committed segment; it is patched in place first. */
  onAmended?(seq: number, text: string, speaker: number, fixes: Fix[]): void;
  /** A tentative speaker label (`speakerProvisional`) settled: `verdict` is
   * "confirmed", "amended" or "unverified".  The segment is patched first. */
  onSpeakerSettled?(seq: number, speaker: number, verdict: string, confidence?: number): void;
  /** Every sentence upsert (`sentences.enabled`); the returned `sentences`
   * list is kept up to date (dropped sentences are removed). */
  onSentence?(sentence: SentenceSegment): void;
  readyDeadlineMs?: number;
}

export interface RealtimeTranscript {
  segments: CommittedSegment[];
  /** Sentence upserts folded into their final state (empty unless
   * `sentences.enabled`). */
  sentences: SentenceSegment[];
  text: string;
  doneReason: 'eof' | 'max_duration' | 'cancelled' | null;
  stats: SessionStats | null;
}

/** `vs.realtime`: a realtime session is a signed token plus one socket.
 * Nothing is stored: the transcript is what the socket sends. */
export class Realtime {
  readonly #t: Transport;

  constructor(t: Transport) {
    this.#t = t;
  }

  /** `POST /v1/realtime/sessions`: validate the options, get a signed `streamUrl`. */
  createSession(options: SessionOptions = {}, call: CallOptions = {}): Promise<CreateSessionResponse> {
    return this.#t.json('POST', '/v1/realtime/sessions', { body: options, ...call });
  }

  /** `createSession`, then open the socket and wait for `session.ready`. */
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

  /** `GET /v1/realtime/capabilities`: languages, audio formats, limits. */
  capabilities(): Promise<Capabilities> {
    return this.#t.json('GET', '/v1/realtime/capabilities');
  }

  /** `POST /v1/realtime/warm`: a person is using a screen that can start a
   * live transcription, so the one they start next is ready at once.  Send
   * it on real use (input, focus, a visible window), at most every 30 s,
   * and at once when the selected spoken language changes. */
  async warm(req: WarmRequest): Promise<void> {
    await this.#t.json('POST', '/v1/realtime/warm', { body: req });
  }

  /** Stream an encoded file (mp3, wav, flac, ogg, m4a…) through a realtime
   * session and collect the transcript.  Nothing is stored; for a stored,
   * shareable transcription use `vs.transcriptions.create`. */
  async transcribeFile(file: FileInput, opts: TranscribeOptions = {}): Promise<RealtimeTranscript> {
    const { onSession, readyDeadlineMs, handlers, options } = split(opts);
    const session = await this.connect({ ...options, input: { kind: 'file' } }, { readyDeadlineMs });
    onSession?.(session);
    await session.sendFile(fileChunks(file));
    return collectTranscript(session, handlers);
  }

  /** The same for a link the engine fetches itself. */
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

/** Upsert one sentence frame into a list kept in sentenceId order. */
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
