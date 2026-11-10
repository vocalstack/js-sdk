import type { ServerFrame, SubscriberFrame, TranscriptSnapshot } from '@vocalstack/contract';

import { VocalStackError } from './errors.js';
import { openWebSocket, WS_OPEN, type WsLike } from './ws.js';

export interface SubscribeOptions {
  lang?: string;
  voice?: string;
  listenerToken?: string;
  shareCode?: string;
  asOwner?: boolean;
  audio?: boolean;
}

export type SubscriptionEvent =
  | { type: 'snapshot'; snapshot: TranscriptSnapshot; reason: 'initial' | 'gap' }
  | { type: 'frame'; frame: ServerFrame | SubscriberFrame; seq?: number }
  | { type: 'audio'; bytes: ArrayBuffer }
  | { type: 'closed'; reason?: string };

type Snapshotter = (after: number | undefined) => Promise<TranscriptSnapshot>;

export interface CatchUpLimits {
  waitsMs?: number[];
  giveUpAfterMs?: number;
  mostHeld?: number;
}

const CATCH_UP_WAITS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
const CATCH_UP_GIVE_UP_MS = 60_000;
const MOST_HELD = 5_000;

export const CATCH_UP_FAILED = 'catch-up failed';

export class Subscription implements AsyncIterable<SubscriptionEvent> {
  readonly recordingId: string;
  cursor = -1;
  snapshot: TranscriptSnapshot | null = null;

  #snap: Snapshotter;
  #opts: SubscribeOptions;
  #ws: WsLike;
  #queue: SubscriptionEvent[] = [];
  #wake: (() => void) | null = null;
  #closed = false;
  #saidClosed = false;
  #buffering: Array<{ seq?: number; frame: any }> | null = [];
  #limits: Required<CatchUpLimits>;
  #stopWaiting: (() => void) | null = null;

  private constructor(recordingId: string, ws: WsLike, opts: SubscribeOptions, snap: Snapshotter, limits: CatchUpLimits) {
    this.recordingId = recordingId;
    this.#ws = ws;
    this.#opts = opts;
    this.#snap = snap;
    this.#limits = {
      waitsMs: limits.waitsMs?.length ? limits.waitsMs : CATCH_UP_WAITS_MS,
      giveUpAfterMs: limits.giveUpAfterMs ?? CATCH_UP_GIVE_UP_MS,
      mostHeld: limits.mostHeld ?? MOST_HELD,
    };
  }

  static async open(recordingId: string, url: string, bearer: string | undefined, opts: SubscribeOptions, snap: Snapshotter, limits: CatchUpLimits = {}): Promise<Subscription> {
    const ws = await openWebSocket(url, bearer);
    ws.binaryType = 'arraybuffer';
    const sub = new Subscription(recordingId, ws, opts, snap, limits);
    try {
      await sub.#ready(ws);
      if (opts.audio) sub.setAudio(true);
      await sub.#resnapshot('initial');
    } catch (e) {
      sub.close();
      throw e;
    }
    return sub;
  }

  #ready(ws: WsLike): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new VocalStackError('engine_unavailable', 'no subscribe.ready', { retryable: true })), 15_000);
      ws.addEventListener('message', (ev: any) => {
        if (typeof ev.data !== 'string') {
          this.#push({ type: 'audio', bytes: ev.data });
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
        this.#onFrame(frame);
      });
      ws.addEventListener('close', (ev: any) => {
        clearTimeout(timer);
        this.#sayClosed(ev?.reason);
        this.#closed = true;
        this.#stopWaiting?.();
        this.#wake?.();
        reject(new VocalStackError('engine_unavailable', 'socket closed before subscribe.ready', { retryable: true }));
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new VocalStackError('engine_unavailable', 'subscriber socket error', { retryable: true }));
      });
    });
  }

  #sayClosed(reason?: string) {
    if (this.#saidClosed) return;
    this.#saidClosed = true;
    this.#push({ type: 'closed', reason });
  }

  #giveUp() {
    if (this.#closed) return;
    this.#buffering = null;
    this.#sayClosed(CATCH_UP_FAILED);
    this.close();
  }

  #hold(seq: number | undefined, frame: any) {
    const held = this.#buffering!;
    if (held.length >= this.#limits.mostHeld) {
      this.#giveUp();
      return;
    }
    held.push({ seq, frame });
  }

  async #catchUp() {
    const until = Date.now() + this.#limits.giveUpAfterMs;
    const waits = this.#limits.waitsMs;
    for (let n = 0; !this.#closed; n++) {
      try {
        await this.#resnapshot('gap');
        return;
      } catch (e) {
        if (this.#closed) return;
        if (refusedForGood(e)) break;
        const asked = e instanceof VocalStackError ? e.retryAfter : undefined;
        const wait = Math.max(waits[Math.min(n, waits.length - 1)], asked !== undefined ? asked * 1000 : 0);
        if (Date.now() + wait > until) break;
        await new Promise<void>((r) => {
          const t = setTimeout(r, wait);
          this.#stopWaiting = () => {
            clearTimeout(t);
            r();
          };
        });
        this.#stopWaiting = null;
      }
    }
    this.#giveUp();
  }

  async #resnapshot(reason: 'initial' | 'gap') {
    const snap = await this.#snap(reason === 'gap' ? this.cursor : undefined);
    if (this.#closed && reason === 'gap') return;
    this.snapshot = reason === 'initial' || !this.snapshot ? snap : mergeSnapshot(this.snapshot, snap);
    this.cursor = Math.max(this.cursor, snap.lastSeq);
    this.#push({ type: 'snapshot', snapshot: snap, reason });
    const buffered = this.#buffering ?? [];
    this.#buffering = null;
    for (const b of buffered) this.#onFrame(b.frame);
  }

  #onFrame(frame: any) {
    if (this.#closed) return;
    const seq: number | undefined = typeof frame.cursor === 'number' ? frame.cursor : typeof frame.seq === 'number' ? frame.seq : undefined;
    if (this.#buffering) {
      this.#hold(seq, frame);
      return;
    }
    if (seq !== undefined) {
      if (seq <= this.cursor) return;
      if (seq > this.cursor + 1) {
        this.#buffering = [{ seq, frame }];
        void this.#catchUp();
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

  setLanguage(lang: string | null) {
    this.#opts.lang = lang ?? undefined;
    this.#send({ type: 'subscribe.update', lang: lang ?? 'none' });
  }

  setAudio(enabled: boolean) {
    this.#send({ type: 'subscribe.update', audio: enabled });
  }

  #send(frame: unknown) {
    if (this.#ws.readyState === WS_OPEN) this.#ws.send(JSON.stringify(frame));
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#stopWaiting?.();
    try {
      this.#ws.close();
    } catch {
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

function refusedForGood(e: unknown): boolean {
  if (!(e instanceof VocalStackError) || e.retryable || e.status === undefined) return false;
  return e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;
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
