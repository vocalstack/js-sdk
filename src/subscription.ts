import type { ServerFrame, SubscriberFrame, TranscriptSnapshot } from '@vocalstack/contract';

import { VocalStackError } from './errors.js';
import { openWebSocket, WS_OPEN, type WsLike } from './ws.js';

export interface SubscribeOptions {
  /** Read (and hear) the recording in this language. */
  lang?: string;
  /** Which voice speaks `lang` for this listener: a voice id from
   * `vs.voices.available(lang)`.  Omitted means the recording's
   * `settings.voiceByLang` pin, then the engine's pick. */
  voice?: string;
  /** A private broadcast's listener token (the one VocalStack's listener page holds). */
  listenerToken?: string;
  /** Read a transcription through its share link. */
  shareCode?: string;
  /** With a token the socket is an owner subscriber (full frames, audience
   * counts); `false` listens as a plain listener. */
  asOwner?: boolean;
  /** Live original audio (binary Opus frames) from the start. */
  audio?: boolean;
}

export type SubscriptionEvent =
  | { type: 'snapshot'; snapshot: TranscriptSnapshot; reason: 'initial' | 'gap' }
  | { type: 'frame'; frame: ServerFrame | SubscriberFrame; seq?: number }
  | { type: 'audio'; bytes: ArrayBuffer }
  | { type: 'closed'; reason?: string };

type Snapshotter = (after: number | undefined) => Promise<TranscriptSnapshot>;

/** A recording's live fan-out (`vs.recordings.subscribe`).  It resolves
 * once the backfill snapshot is in place; live frames follow through the
 * async iterator, with gaps detected on the cursor and healed by
 * re-snapshotting. */
export class Subscription implements AsyncIterable<SubscriptionEvent> {
  readonly recordingId: string;
  /** Highest durable cursor applied (snapshot or frame). */
  cursor = -1;
  snapshot: TranscriptSnapshot | null = null;

  #snap: Snapshotter;
  #opts: SubscribeOptions;
  #ws: WsLike;
  #queue: SubscriptionEvent[] = [];
  #wake: (() => void) | null = null;
  #closed = false;
  #healing = false;
  #buffering: Array<{ seq?: number; frame: any }> | null = [];

  private constructor(recordingId: string, ws: WsLike, opts: SubscribeOptions, snap: Snapshotter) {
    this.recordingId = recordingId;
    this.#ws = ws;
    this.#opts = opts;
    this.#snap = snap;
  }

  /** @internal */
  static async open(recordingId: string, url: string, bearer: string | undefined, opts: SubscribeOptions, snap: Snapshotter): Promise<Subscription> {
    const ws = await openWebSocket(url, bearer);
    ws.binaryType = 'arraybuffer';
    const sub = new Subscription(recordingId, ws, opts, snap);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new VocalStackError('engine_unavailable', 'no subscribe.ready', { retryable: true })), 15_000);
      ws.addEventListener('message', (ev: any) => {
        if (typeof ev.data !== 'string') {
          sub.#push({ type: 'audio', bytes: ev.data });
          return;
        }
        let frame: any;
        try {
          frame = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (frame.type === 'subscribe.ready') {
          clearTimeout(timer);
          resolve();
          return;
        }
        sub.#onFrame(frame);
      });
      ws.addEventListener('close', (ev: any) => {
        clearTimeout(timer);
        sub.#push({ type: 'closed', reason: ev?.reason });
        sub.#closed = true;
        sub.#wake?.();
        reject(new VocalStackError('engine_unavailable', 'socket closed before subscribe.ready', { retryable: true }));
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new VocalStackError('engine_unavailable', 'subscriber socket error', { retryable: true }));
      });
    });
    if (opts.audio) sub.setAudio(true);
    await sub.#resnapshot('initial');
    return sub;
  }

  async #resnapshot(reason: 'initial' | 'gap') {
    const snap = await this.#snap(reason === 'gap' ? this.cursor : undefined);
    this.snapshot = reason === 'initial' || !this.snapshot ? snap : mergeSnapshot(this.snapshot, snap);
    this.cursor = Math.max(this.cursor, snap.lastSeq);
    this.#push({ type: 'snapshot', snapshot: snap, reason });
    const buffered = this.#buffering ?? [];
    this.#buffering = null;
    for (const b of buffered) this.#onFrame(b.frame);
  }

  #onFrame(frame: any) {
    // The relay cursor is `cursor`; segment-scoped frames use `seq` for the segment.
    const seq: number | undefined = typeof frame.cursor === 'number' ? frame.cursor : typeof frame.seq === 'number' ? frame.seq : undefined;
    if (this.#buffering) {
      this.#buffering.push({ seq, frame });
      return;
    }
    if (seq !== undefined) {
      if (seq <= this.cursor) return; // already in the snapshot
      if (seq > this.cursor + 1 && !this.#healing) {
        this.#healing = true;
        this.#buffering = [{ seq, frame }];
        this.#resnapshot('gap')
          .catch(() => {})
          .finally(() => {
            this.#healing = false;
          });
        return;
      }
      this.cursor = seq;
      if (frame.type === 'noop') return;
    }
    this.#push({ type: 'frame', frame, seq });
  }

  #push(ev: SubscriptionEvent) {
    this.#queue.push(ev);
    this.#wake?.();
  }

  /** Switch the target language (`null` = as spoken). */
  setLanguage(lang: string | null) {
    // A gap heal re-reads the snapshot in the language being read now.
    this.#opts.lang = lang ?? undefined;
    this.#send({ type: 'subscribe.update', lang: lang ?? 'none' });
  }

  /** Opt in or out of live original audio. */
  setAudio(enabled: boolean) {
    this.#send({ type: 'subscribe.update', audio: enabled });
  }

  #send(frame: unknown) {
    if (this.#ws.readyState === WS_OPEN) this.#ws.send(JSON.stringify(frame));
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    try {
      this.#ws.close();
    } catch {
      // already closed
    }
    this.#wake?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SubscriptionEvent> {
    for (;;) {
      if (this.#queue.length) {
        yield this.#queue.shift()!;
        continue;
      }
      if (this.#closed) return;
      await new Promise<void>((r) => {
        this.#wake = r;
      });
      this.#wake = null;
    }
  }
}

function mergeSnapshot(base: TranscriptSnapshot, delta: TranscriptSnapshot): TranscriptSnapshot {
  const segs = new Map(base.segments.map((s) => [s.seq, s]));
  for (const s of delta.segments) segs.set(s.seq, s);
  const sents = new Map(base.sentences.map((s) => [s.sentenceId, s]));
  for (const s of delta.sentences) sents.set(s.sentenceId, s);
  return {
    ...delta,
    segments: [...segs.values()].sort((a, b) => a.seq - b.seq),
    sentences: [...sents.values()].sort((a, b) => a.sentenceId - b.sentenceId),
    speakers: delta.speakers.length ? delta.speakers : base.speakers,
    spans: delta.spans.length ? delta.spans : base.spans,
  };
}
