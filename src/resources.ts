import type {
  AppearanceSamples,
  AppStreamKey,
  AudioSourceCheck,
  AutoTopUpSettings,
  AutoTopUpView,
  BillingDetails,
  BillingView,
  CheckPromoCode,
  CheckoutView,
  CreateCheckout,
  LowBalanceAlertSettings,
  LowBalanceAlertView,
  PaymentDocument,
  PaymentMethodList,
  PaymentPage,
  PortalLink,
  PromoCodeView,
  SetInterval,
  SubscriptionView,
  YearlyOptIn,
  UsageChargePage,
  UsageReport,
  Broadcast,
  Correction,
  CorrectionBatch,
  CorrectionPage,
  CreateAppStreamKey,
  CreateAudioSource,
  CreateLiveTranscription,
  CreateBroadcast,
  CreateShareLink,
  CreateTag,
  CreateTranscription,
  CompleteFileUpload,
  CreateFileUpload,
  FileUpload,
  CreateSpeaker,
  CreateSpeakerFromAppearance,
  CreatedAppStreamKey,
  ChargePage,
  ExportFormat,
  ClientApp,
  ClientPolicy,
  Health,
  LanguageLists,
  LedgerPage,
  LinkProbe,
  PatchSpeaker,
  PlanList,
  PublishGrant,
  Recording,
  RecordingEvent,
  RecordingEvents,
  RecordingPage,
  RetranscribeLine,
  RtmpStatus,
  SearchResults,
  VectorResults,
  SettingsPatch,
  Script,
  ShareLink,
  SharedTranscript,
  StartRecording,
  StartJob,
  SummaryStatus,
  Tag,
  TagList,
  TagTranscriptions,
  Transcription,
  TranscriptionJob,
  TranscriptionPage,
  TranscriptSnapshot,
  UpdateBroadcast,
  UpdateTag,
  UpdateTranscription,
  UpdateShareLink,
  UploadRecording,
  Speaker,
  VoiceCatalogue,
  VoiceTrack,
  ManyResult,
} from '@vocalstack/contract';

import { VocalStackError } from './errors.js';
import { listenerQuery, seg, Transport, type CallOptions, type Query, type ReadAs } from './http.js';
import { RealtimeSession, type ConnectOptions } from './realtime.js';
import { Subscription, type SubscribeOptions } from './subscription.js';
import { openWebSocket, type WsLike } from './ws.js';

export type Upload = Blob | Uint8Array | ArrayBuffer | string;

export type LifecycleFilter = 'active' | 'archived' | 'all';

export interface TranscriptionFilters {
  lifecycle?: LifecycleFilter;
  q?: string;
  site?: string;
  language?: string;
  kind?: 'file' | 'link' | 'live';
  origin?: Transcription['origin'];
  tag?: string;
  broadcast?: string;
  createdAfter?: string | Date;
  createdBefore?: string | Date;
  shared?: boolean;
}

function filterQuery(f: TranscriptionFilters) {
  const at = (d: string | Date | undefined) => (d instanceof Date ? d.toISOString() : d);
  return { lifecycle: f.lifecycle, q: f.q, site: f.site, language: f.language, kind: f.kind, origin: f.origin, tag: f.tag, broadcast: f.broadcast, createdAfter: at(f.createdAfter), createdBefore: at(f.createdBefore), shared: f.shared };
}

async function toBlob(file: Upload): Promise<{ blob: Blob; name?: string }> {
  if (typeof file === 'string') {
    const fsSpecifier = 'node:' + 'fs';
    const { openAsBlob } = (await import(/* @vite-ignore */ fsSpecifier)) as typeof import('node:fs');
    return { blob: await openAsBlob(file), name: file.split(/[\\/]/).pop() };
  }
  if (typeof Blob !== 'undefined' && file instanceof Blob) {
    return { blob: file, name: (file as File).name || undefined };
  }
  return { blob: new Blob([file as BlobPart]) };
}

async function allPages<T>(page: (cursor: string | undefined) => Promise<{ items: T[] | undefined; nextCursor?: string | null }>): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (;;) {
    const r = await page(cursor);
    out.push(...(r.items ?? []));
    if (!r.nextCursor) return out;
    cursor = r.nextCursor;
  }
}

export interface RecordingPageOptions extends PageOptions {
  lifecycle?: 'active' | 'archived';
}

abstract class ParentResource<T, U> {
  protected readonly t: Transport;
  protected abstract readonly base: '/v1/broadcasts' | '/v1/transcriptions';
  protected abstract readonly key: 'broadcasts' | 'transcriptions';

  constructor(t: Transport) {
    this.t = t;
  }

  protected p(id: string, rest = ''): string {
    return `${this.base}/${seg(id)}${rest}`;
  }

  list(lifecycle: LifecycleFilter = 'active'): Promise<T[]> {
    return allPages(async (cursor) => {
      const r = await this.t.json<Partial<Record<'broadcasts' | 'transcriptions', T[]>> & { nextCursor?: string | null }>('GET', this.base, { query: { lifecycle, cursor } });
      return { items: r[this.key], nextCursor: r.nextCursor };
    });
  }
  get(id: string): Promise<T> {
    return this.t.json('GET', this.p(id));
  }
  update(id: string, req: U): Promise<T> {
    return this.t.json('PATCH', this.p(id), { body: req });
  }
  archive(id: string): Promise<T> {
    return this.t.json('POST', this.p(id, '/archive'));
  }
  restore(id: string): Promise<T> {
    return this.t.json('POST', this.p(id, '/restore'));
  }
  async purge(id: string): Promise<void> {
    await this.t.json('POST', this.p(id, '/purge'));
  }
  archiveMany(ids: string[]): Promise<ManyResult> {
    return this.t.json('POST', `${this.base}/archive`, { body: { ids } });
  }
  restoreMany(ids: string[]): Promise<ManyResult> {
    return this.t.json('POST', `${this.base}/restore`, { body: { ids } });
  }
  purgeMany(ids: string[]): Promise<ManyResult> {
    return this.t.json('POST', `${this.base}/purge`, { body: { ids } });
  }
  listRecordings(id: string, lifecycle: 'active' | 'archived' = 'active'): Promise<Recording[]> {
    return allPages(async (cursor) => {
      const r = await this.listRecordingsPage(id, { lifecycle, cursor });
      return { items: r.recordings, nextCursor: r.nextCursor };
    });
  }
  listRecordingsPage(id: string, opts: RecordingPageOptions = {}): Promise<RecordingPage> {
    return this.t.json('GET', this.p(id, '/recordings'), { query: { lifecycle: opts.lifecycle, cursor: opts.cursor, limit: opts.limit } });
  }
  startRecording(id: string, req: StartRecording = {}, call: CallOptions = {}): Promise<PublishGrant> {
    return this.t.json('POST', this.p(id, '/recordings'), { body: req, ...call });
  }
  async listShareLinks(id: string): Promise<ShareLink[]> {
    const r = await this.t.json<{ links?: ShareLink[] }>('GET', this.p(id, '/share-links'));
    return r.links ?? [];
  }
  async listScripts(id: string): Promise<Script[]> {
    const r = await this.t.json<{ scripts?: Script[] }>('GET', this.p(id, '/scripts'));
    return r.scripts ?? [];
  }
  createShareLink(id: string, req: CreateShareLink): Promise<ShareLink> {
    return this.t.json('POST', this.p(id, '/share-links'), { body: req });
  }
  async events(id: string, as: ReadAs & { asOwner?: boolean } = {}): Promise<WsLike> {
    const token = as.asOwner === false ? undefined : await this.t.bearer();
    return openWebSocket(this.t.wsUrl(this.p(id, '/events'), listenerQuery(as)), token);
  }
}

export class Broadcasts extends ParentResource<Broadcast, UpdateBroadcast> {
  protected readonly base = '/v1/broadcasts' as const;
  protected readonly key = 'broadcasts' as const;

  create(req: CreateBroadcast, call: CallOptions = {}): Promise<Broadcast> {
    return this.t.json('POST', this.base, { body: req, ...call });
  }
  addAudioSource(id: string, req: CreateAudioSource): Promise<Broadcast> {
    return this.t.json('POST', this.p(id, '/audio-sources'), { body: req });
  }
  removeAudioSource(id: string, sourceId: string): Promise<Broadcast> {
    return this.t.json('DELETE', this.p(id, `/audio-sources/${seg(sourceId)}`));
  }
  checkAudioSource(id: string, sourceId: string, opts: { fresh?: boolean } = {}): Promise<AudioSourceCheck> {
    return this.t.json('GET', this.p(id, `/audio-sources/${seg(sourceId)}/check`), { query: { fresh: opts.fresh || undefined } });
  }
}

export type CreateTranscriptionInput = CreateTranscription & {
  file?: Upload;
  fileName?: string;
};

export class Transcriptions extends ParentResource<Transcription, UpdateTranscription> {
  protected readonly base = '/v1/transcriptions' as const;
  protected readonly key = 'transcriptions' as const;

  override list(opts: LifecycleFilter | TranscriptionFilters = 'active'): Promise<Transcription[]> {
    const f = typeof opts === 'string' ? { lifecycle: opts } : opts;
    return allPages(async (cursor) => {
      const r = await this.listPage({ ...f, cursor });
      return { items: r.transcriptions, nextCursor: r.nextCursor };
    });
  }
  listPage(opts: PageOptions & TranscriptionFilters = {}): Promise<TranscriptionPage> {
    return this.t.json('GET', this.base, { query: { ...filterQuery(opts), cursor: opts.cursor, limit: opts.limit } });
  }
  uploadRecording(id: string, req: UploadRecording = {}, call: CallOptions = {}): Promise<PublishGrant> {
    return this.t.json('POST', this.p(id, '/recordings/upload'), { body: req, ...call });
  }

  async create(req: CreateTranscriptionInput, call: CallOptions = {}): Promise<Transcription> {
    const { file, fileName, ...options } = req;
    if (file === undefined) return this.t.json('POST', this.base, { body: options, ...call });
    const { blob, name } = await toBlob(file);
    const fd = new FormData();
    fd.append('options', JSON.stringify(options));
    fd.append('file', blob, fileName ?? name ?? 'upload');
    return this.t.json('POST', this.base, { body: fd, ...call });
  }
  createFromUrl(url: string, opts: Omit<CreateTranscription, 'url'> = {}, call: CallOptions = {}): Promise<Transcription> {
    return this.create({ ...opts, url }, call);
  }
  createLive(req: CreateLiveTranscription, call: CallOptions = {}): Promise<Transcription> {
    return this.t.json('POST', `${this.base}/live`, { body: req, ...call });
  }
  async lookup(url: string): Promise<Transcription | null> {
    const r = await this.t.json<{ transcription?: Transcription | null }>('GET', `${this.base}/lookup`, { query: { url } });
    return r.transcription ?? null;
  }
  probe(url: string): Promise<LinkProbe> {
    return this.t.json('GET', `${this.base}/probe`, { query: { url } });
  }
  attachBroadcast(id: string, broadcastId: string): Promise<Transcription> {
    return this.t.json('PUT', this.p(id, `/broadcasts/${seg(broadcastId)}`));
  }
  detachBroadcast(id: string, broadcastId: string): Promise<Transcription> {
    return this.t.json('DELETE', this.p(id, `/broadcasts/${seg(broadcastId)}`));
  }
  async nameAppearance(id: string, appearance: number, name: string | null): Promise<void> {
    await this.t.json('PUT', this.p(id, `/appearances/${seg(appearance)}`), { body: { name } });
  }
}

export interface SendUploadOptions {
  name?: string;
  mime?: string;
  concurrency?: number;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

export class Uploads {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }

  create(req: CreateFileUpload): Promise<FileUpload> {
    return this.#t.json('POST', '/v1/uploads', { body: req });
  }
  complete(id: string, req: CompleteFileUpload): Promise<FileUpload> {
    return this.#t.json('POST', `/v1/uploads/${seg(id)}/complete`, { body: req });
  }

  async send(file: Upload, opts: SendUploadOptions = {}): Promise<FileUpload> {
    const { blob, name } = await toBlob(file);
    const mime = opts.mime ?? (blob.type || undefined);
    const up = await this.create({ name: opts.name ?? name ?? 'upload', bytes: blob.size, ...(mime ? { mime } : {}) });
    const parts = up.parts ?? [];
    const etags: { number: number; etag: string }[] = [];
    const sent = new Map<number, number>();
    const report = () => opts.onProgress?.([...sent.values()].reduce((a, b) => a + b, 0), blob.size);
    let next = 0;
    const one = async (): Promise<void> => {
      for (;;) {
        const p = parts[next++];
        if (!p) return;
        const from = (p.number - 1) * up.partBytes;
        let etag: string | null = null;
        for (let attempt = 0; attempt < 3 && etag === null; attempt++) {
          try {
            const res = await this.#t.external(p.url, { method: 'PUT', body: blob.slice(from, from + p.bytes), signal: opts.signal });
            if (res.ok) etag = res.headers.get('etag');
            else if (res.status < 500) throw new VocalStackError('invalid_state', `storage refused part ${p.number} (${res.status})`);
          } catch (e) {
            if ((e as { name?: string } | null)?.name === 'AbortError' || e instanceof VocalStackError || attempt === 2) throw e;
          }
        }
        if (!etag) throw new VocalStackError('unavailable', `part ${p.number} was sent but storage gave no ETag (the bucket must expose it)`, { retryable: true });
        etags.push({ number: p.number, etag });
        sent.set(p.number, p.bytes);
        report();
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, parts.length)) }, one));
    return this.complete(up.id, { parts: etags.sort((a, b) => a.number - b.number) });
  }
}

export class Recordings {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  #p(id: string, rest = '') {
    return `/v1/recordings/${seg(id)}${rest}`;
  }

  get(id: string, as?: ReadAs): Promise<Recording> {
    return this.#t.json('GET', this.#p(id), { query: listenerQuery(as) });
  }
  pause(id: string): Promise<Recording> {
    return this.#t.json('POST', this.#p(id, '/pause'));
  }
  resume(id: string): Promise<Recording> {
    return this.#t.json('POST', this.#p(id, '/resume'));
  }
  stop(id: string, reason?: string): Promise<Recording> {
    return this.#t.json('POST', this.#p(id, '/stop'), { body: { reason } });
  }
  settings(id: string, patch: SettingsPatch): Promise<Recording> {
    return this.#t.json('PATCH', this.#p(id, '/settings'), { body: patch });
  }
  publishToken(id: string, opts: { takeover?: boolean } = {}): Promise<PublishGrant> {
    return this.#t.json('POST', this.#p(id, '/publish-token'), { body: { takeover: opts.takeover ?? false } });
  }
  publish(grant: PublishGrant, opts: ConnectOptions = {}): Promise<RealtimeSession> {
    if (!grant.streamUrl) throw new VocalStackError('invalid_state', 'this grant has no streamUrl (an upload recording has no publisher socket)');
    return RealtimeSession.connect({
      sessionId: grant.sessionId ?? grant.recording.id,
      streamUrl: grant.streamUrl,
      readyDeadlineMs: opts.readyDeadlineMs ?? this.#t.opts.readyDeadlineMs,
      onLoading: opts.onLoading,
      onQueued: opts.onQueued,
      onFrame: opts.onFrame,
    });
  }
  archive(id: string): Promise<Recording> {
    return this.#t.json('POST', this.#p(id, '/archive'));
  }
  restore(id: string): Promise<Recording> {
    return this.#t.json('POST', this.#p(id, '/restore'));
  }
  async purge(id: string): Promise<void> {
    await this.#t.json('POST', this.#p(id, '/purge'));
  }
  archiveMany(ids: string[]): Promise<ManyResult> {
    return this.#t.json('POST', '/v1/recordings/archive', { body: { ids } });
  }
  restoreMany(ids: string[]): Promise<ManyResult> {
    return this.#t.json('POST', '/v1/recordings/restore', { body: { ids } });
  }
  purgeMany(ids: string[]): Promise<ManyResult> {
    return this.#t.json('POST', '/v1/recordings/purge', { body: { ids } });
  }
  transcript(id: string, opts: { after?: number; lang?: string; asListener?: boolean } & ReadAs = {}): Promise<TranscriptSnapshot> {
    return this.#t.json('GET', this.#p(id, '/transcript'), {
      query: { ...listenerQuery(opts), after: opts.after, lang: opts.lang, role: opts.asListener ? 'listener' : undefined },
    });
  }
  translation(id: string, lang: string, sentences: number[] = [], as?: ReadAs): Promise<{ lang: string; translations: Record<string, string> }> {
    return this.#t.json('GET', this.#p(id, '/translation'), {
      query: { ...listenerQuery(as), lang, sentences: sentences.length ? sentences.join(',') : undefined },
    });
  }
  summarize(id: string, call: CallOptions = {}): Promise<SummaryStatus> {
    return this.#t.json('POST', this.#p(id, '/summarize'), call);
  }
  summary(id: string, opts: { lang?: string } & ReadAs = {}): Promise<SummaryStatus> {
    return this.#t.json('GET', this.#p(id, '/summary'), { query: { ...listenerQuery(opts), lang: opts.lang } });
  }
  export(id: string, format: ExportFormat, opts: { lang?: string } & ReadAs = {}): Promise<Response> {
    return this.#t.raw('GET', this.#p(id, '/export'), { headers: { accept: '*/*' }, query: { ...listenerQuery(opts), format, lang: opts.lang } });
  }
  async exportUrl(id: string, format: ExportFormat, opts: { lang?: string; shareCode?: string; listenerToken?: string } = {}): Promise<string> {
    const token = opts.shareCode || opts.listenerToken ? undefined : await this.#t.bearer();
    return this.#t.url(this.#p(id, '/export'), { format, lang: opts.lang, shareCode: opts.shareCode, listenerToken: opts.listenerToken, access_token: token });
  }
  async audioUrl(id: string, opts: { kind?: 'delivery' | 'background' | 'speech' | 'master' | 'source' | 'video'; lang?: string; format?: string } & ReadAs = {}): Promise<string> {
    const res = await this.#t.raw('GET', this.#p(id, '/audio'), {
      query: { ...listenerQuery(opts), kind: opts.kind, lang: opts.lang, format: opts.format },
    });
    const location = res.headers.get('location');
    if (!location) throw new VocalStackError('not_found', 'no signed URL in the redirect');
    return location;
  }
  audioSrc(id: string, opts: { kind?: AudioKind; lang?: string; voices?: VoicesChoice; voice?: string; format?: MediaFormat } & MediaAuth = {}): string {
    return this.#t.url(this.#p(id, '/audio'), { kind: opts.kind ?? 'delivery', lang: opts.lang, format: opts.format, voices: opts.voices, voice: opts.voice, ...mediaQuery(opts) });
  }
  clipSrc(id: string, startS: number, endS: number, opts: { clean?: boolean } & MediaAuth = {}): string {
    return this.#t.url(this.#p(id, '/audio/clip'), { startS: startS.toFixed(2), endS: endS.toFixed(2), clean: opts.clean ? 'true' : undefined, ...mediaQuery(opts) });
  }
  voiceClipSrc(id: string, sentence: number, lang: string, opts: { voices?: VoicesChoice; voice?: string; format?: 'ogg' | 'caf'; part?: number; v?: string } & MediaAuth = {}): string {
    return this.#t.url(this.#p(id, `/voice/${seg(sentence)}`), {
      lang,
      voices: opts.voices,
      voice: opts.voice,
      format: opts.format,
      part: opts.part ? opts.part : undefined,
      v: opts.v,
      ...mediaQuery(opts),
    });
  }
  clip(id: string, startS: number, endS: number, as?: ReadAs): Promise<Response> {
    return this.#t.raw('GET', this.#p(id, '/audio/clip'), { headers: { accept: '*/*' }, query: { ...listenerQuery(as), startS, endS } });
  }
  voice(id: string, lang?: string, as?: ReadAs): Promise<VoiceTrack[]> {
    return this.#t.json('GET', this.#p(id, '/voice'), { query: { ...listenerQuery(as), lang } });
  }
  renderVoice(id: string, langs: string[], call?: CallOptions): Promise<VoiceTrack[]>;
  renderVoice(id: string, req: RenderVoice & ReadAs, call?: CallOptions): Promise<VoiceTrack[]>;
  renderVoice(id: string, req: string[] | (RenderVoice & ReadAs), call: CallOptions = {}): Promise<VoiceTrack[]> {
    const r: RenderVoice & ReadAs = Array.isArray(req) ? { langs: req } : req;
    return this.#t.json('POST', this.#p(id, '/voice'), {
      query: listenerQuery(r),
      body: { langs: r.langs, voices: r.voices, voice: r.voice, voiceBySpeaker: r.voiceBySpeaker, near: r.near, consent: r.consent },
      ...call,
    });
  }
  voiceClip(id: string, sentence: number, lang: string, opts: { format?: 'ogg' | 'caf'; voices?: VoicesChoice } & ReadAs = {}): Promise<Response> {
    return this.#t.raw('GET', this.#p(id, `/voice/${seg(sentence)}`), { headers: { accept: '*/*' }, query: { ...listenerQuery(opts), lang, format: opts.format, voices: opts.voices } });
  }
  mediaToken(id: string): Promise<{ token: string; expiresAt: string }> {
    return this.#t.json('GET', this.#p(id, '/media-token'));
  }
  events(id: string, opts: { after?: number; limit?: number } = {}): Promise<RecordingEvent[]> {
    return allPages(async (cursor) => {
      const r = await this.eventsPage(id, cursor ? { cursor, limit: opts.limit } : { after: opts.after, limit: opts.limit });
      return { items: r.events, nextCursor: r.nextCursor };
    });
  }
  eventsPage(id: string, opts: { cursor?: string; after?: number; limit?: number } = {}): Promise<RecordingEvents> {
    return this.#t.json('GET', this.#p(id, '/events'), { query: { cursor: opts.cursor, after: opts.after, limit: opts.limit } });
  }
  async subscribe(id: string, opts: SubscribeOptions = {}): Promise<Subscription> {
    const token = opts.asOwner === false ? undefined : await this.#t.bearer();
    const url = this.#t.wsUrl(this.#p(id, '/subscribe'), {
      lang: opts.lang,
      voice: opts.voice,
      ...listenerQuery(opts),
      role: opts.asOwner === false ? 'listener' : undefined,
      device: this.#t.opts.deviceId,
    });
    return Subscription.open(id, url, token, opts, (after) =>
      this.transcript(id, {
        after,
        lang: opts.lang,
        listenerToken: opts.listenerToken,
        shareCode: opts.shareCode,
        asListener: opts.asOwner === false,
      }),
    );
  }
}

export type AudioKind = 'delivery' | 'voice' | 'background' | 'speech' | 'master' | 'source' | 'video';
export type MediaFormat = 'ogg' | 'caf' | 'mp3';

export type VoicesChoice = 'cloned' | 'synthetic';

export interface RenderVoice {
  langs: string[];
  voices?: VoicesChoice;
  voice?: string;
  voiceBySpeaker?: Record<string, string>;
  near?: number;
  consent?: boolean;
}

export interface MediaAuth extends ReadAs {
  token?: string;
  media?: string;
}

function mediaQuery(a: MediaAuth): Query {
  return { media: a.media, access_token: a.media ? undefined : a.token, listenerToken: a.listenerToken, shareCode: a.shareCode };
}

export function playableFormat(): 'ogg' | 'caf' {
  try {
    const doc = (globalThis as { document?: { createElement(t: string): { canPlayType?(t: string): string } } }).document;
    return doc?.createElement('audio').canPlayType?.('audio/x-caf; codecs=opus') === 'probably' ? 'caf' : 'ogg';
  } catch {
    return 'ogg';
  }
}

const TERMINAL: ReadonlySet<string> = new Set(['done', 'failed', 'stopped', 'cropping']);

export class Jobs {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  get(recordingId: string): Promise<TranscriptionJob> {
    return this.#t.json('GET', `/v1/recordings/${seg(recordingId)}/job`);
  }
  start(recordingId: string, window: StartJob = {}): Promise<TranscriptionJob> {
    return this.#t.json('POST', `/v1/recordings/${seg(recordingId)}/job/start`, { body: window });
  }
  retry(recordingId: string): Promise<TranscriptionJob> {
    return this.#t.json('POST', `/v1/recordings/${seg(recordingId)}/job/retry`);
  }
  preview(recordingId: string): Promise<Response> {
    return this.#t.raw('GET', `/v1/recordings/${seg(recordingId)}/job/preview`, { headers: { accept: '*/*' } });
  }
  async wait(
    recordingId: string,
    opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal; onProgress?(job: TranscriptionJob): void } = {},
  ): Promise<TranscriptionJob> {
    const interval = opts.intervalMs ?? 2000;
    const deadline = opts.timeoutMs ? Date.now() + opts.timeoutMs : Infinity;
    for (;;) {
      const job = await this.get(recordingId);
      opts.onProgress?.(job);
      if (TERMINAL.has(job.state)) return job;
      if (Date.now() + interval > deadline) throw new VocalStackError('timeout', `job still ${job.state} after ${opts.timeoutMs} ms`, { retryable: true });
      if (opts.signal?.aborted) throw opts.signal.reason ?? new Error('aborted');
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}

export class Corrections {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  list(recordingId: string): Promise<Correction[]> {
    return allPages(async (cursor) => {
      const r = await this.listPage(recordingId, { cursor });
      return { items: r.corrections, nextCursor: r.nextCursor };
    });
  }
  listPage(recordingId: string, opts: PageOptions = {}): Promise<CorrectionPage> {
    return this.#t.json('GET', `/v1/recordings/${seg(recordingId)}/corrections`, { query: { cursor: opts.cursor, limit: opts.limit } });
  }
  async apply(recordingId: string, batch: CorrectionBatch): Promise<Correction[]> {
    const r = await this.#t.json<{ corrections?: Correction[] }>('POST', `/v1/recordings/${seg(recordingId)}/corrections`, { body: batch });
    return r.corrections ?? [];
  }
  async retranscribe(recordingId: string, req: RetranscribeLine): Promise<Correction[]> {
    const r = await this.#t.json<{ corrections?: Correction[] }>('POST', `/v1/recordings/${seg(recordingId)}/retranscribe`, { body: req });
    return r.corrections ?? [];
  }
  revert(correctionId: string): Promise<Correction> {
    return this.#t.json('POST', `/v1/corrections/${seg(correctionId)}/revert`);
  }
}

export class ShareLinks {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  open(code: string): Promise<SharedTranscript> {
    return this.#t.json('GET', `/v1/shares/${seg(code)}`, { anonymous: true });
  }
  update(id: string, req: UpdateShareLink): Promise<ShareLink> {
    return this.#t.json('PATCH', `/v1/share-links/${seg(id)}`, { body: req });
  }
  revoke(id: string): Promise<ShareLink> {
    return this.#t.json('DELETE', `/v1/share-links/${seg(id)}`);
  }
}

export class Tags {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  async list(): Promise<Tag[]> {
    const r = await this.#t.json<TagList>('GET', '/v1/tags');
    return r.tags ?? [];
  }
  create(req: CreateTag): Promise<Tag> {
    return this.#t.json('POST', '/v1/tags', { body: req });
  }
  update(id: string, req: UpdateTag): Promise<Tag> {
    return this.#t.json('PATCH', `/v1/tags/${seg(id)}`, { body: req });
  }
  async delete(id: string): Promise<void> {
    await this.#t.json('DELETE', `/v1/tags/${seg(id)}`);
  }
  tagTranscriptions(id: string, req: TagTranscriptions): Promise<Tag> {
    return this.#t.json('POST', `/v1/tags/${seg(id)}/transcriptions`, { body: req });
  }
}

export class Speakers {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  async list(opts: { lifecycle?: 'active' | 'archived' } = {}): Promise<Speaker[]> {
    const r = await this.#t.json<{ speakers?: Speaker[] }>('GET', '/v1/speakers', { query: { lifecycle: opts.lifecycle } });
    return r.speakers ?? [];
  }
  get(id: string): Promise<Speaker> {
    return this.#t.json('GET', `/v1/speakers/${seg(id)}`);
  }
  archive(id: string): Promise<Speaker> {
    return this.#t.json('POST', `/v1/speakers/${seg(id)}/archive`);
  }
  restore(id: string): Promise<Speaker> {
    return this.#t.json('POST', `/v1/speakers/${seg(id)}/restore`);
  }
  archiveMany(ids: string[]): Promise<ManyResult> {
    return this.#t.json('POST', '/v1/speakers/archive', { body: { ids } });
  }
  restoreMany(ids: string[]): Promise<ManyResult> {
    return this.#t.json('POST', '/v1/speakers/restore', { body: { ids } });
  }
  deleteMany(ids: string[]): Promise<ManyResult> {
    return this.#t.json('POST', '/v1/speakers/delete', { body: { ids } });
  }
  async create(req: CreateSpeaker & { sample?: Upload; fileName?: string }, call: CallOptions = {}): Promise<Speaker> {
    const { sample, fileName, ...meta } = req;
    const form = new FormData();
    form.append('meta', JSON.stringify(meta));
    if (sample !== undefined) {
      const { blob, name } = await toBlob(sample);
      form.append('sample', blob, fileName ?? name ?? 'sample.webm');
    }
    return this.#t.json('POST', '/v1/speakers', { body: form, ...call });
  }
  createFromAppearance(req: CreateSpeakerFromAppearance, call: CallOptions = {}): Promise<Speaker> {
    return this.#t.json('POST', '/v1/speakers/from-appearance', { body: req, ...call });
  }
  appearanceSamples(req: { transcriptionId: string; appearance: number; recordingId?: string | null; spans?: { start: number; end: number }[] }): Promise<AppearanceSamples> {
    const spans = req.spans?.length ? req.spans.map((s) => `${s.start}-${s.end}`).join(',') : undefined;
    return this.#t.json('GET', '/v1/speakers/from-appearance/samples', { query: { transcriptionId: req.transcriptionId, recordingId: req.recordingId ?? undefined, appearance: req.appearance, spans } });
  }
  setConsent(id: string, consent: 'granted' | 'refused', opts: { name?: string } = {}): Promise<Speaker> {
    return this.#t.json('POST', `/v1/speakers/${seg(id)}/consent`, { body: { consent, ...opts } });
  }
  update(id: string, patch: PatchSpeaker): Promise<Speaker> {
    return this.#t.json('PATCH', `/v1/speakers/${seg(id)}`, { body: patch });
  }
  async delete(id: string): Promise<void> {
    await this.#t.json('DELETE', `/v1/speakers/${seg(id)}`);
  }
  voicePreview(id: string, opts: { lang?: string; format?: 'ogg' | 'caf'; recording?: string; asOwner?: boolean } & ReadAs = {}): Promise<Response> {
    return this.#t.raw('GET', `/v1/speakers/${seg(id)}/preview`, {
      headers: { accept: '*/*' },
      query: { ...listenerQuery(opts), lang: opts.lang, format: opts.format, recording: opts.recording },
      anonymous: opts.asOwner === false,
    });
  }
  sample(id: string): Promise<Response> {
    return this.#t.raw('GET', `/v1/speakers/${seg(id)}/sample`, { headers: { accept: '*/*' } });
  }
}

export class Voices {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  available(lang: string, opts: { recording?: string; asOwner?: boolean } & ReadAs = {}): Promise<VoiceCatalogue> {
    return this.#t.json('GET', '/v1/voices/available', {
      query: { ...listenerQuery(opts), lang, recording: opts.recording },
      anonymous: opts.asOwner === false,
    });
  }
  preview(voice: string, lang: string, opts: { format?: 'ogg' | 'caf' } = {}): Promise<Response> {
    return this.#t.raw('GET', '/v1/voices/preview', { headers: { accept: '*/*' }, query: { voice, lang, format: opts.format } });
  }
}

export interface SearchOptions extends Omit<TranscriptionFilters, 'lifecycle' | 'q' | 'broadcast'> {
  broadcasts?: string[];
  listenerTokens?: string[];
  recording?: string;
  transcription?: string;
  lang?: string;
  limit?: number;
}

export class Search {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  query(q: string, opts: SearchOptions = {}): Promise<SearchResults> {
    const query: Query = {
      ...filterQuery({ site: opts.site, language: opts.language, kind: opts.kind, origin: opts.origin, tag: opts.tag, createdAfter: opts.createdAfter, createdBefore: opts.createdBefore, shared: opts.shared }),
      q,
      broadcasts: opts.broadcasts?.join(','),
      listenerTokens: opts.listenerTokens?.join(','),
      recording: opts.recording,
      transcription: opts.transcription,
      lang: opts.lang,
      limit: opts.limit,
    };
    return this.#t.json('GET', '/v1/search', { query });
  }
  vector(q: string, opts: VectorSearchOptions = {}): Promise<VectorResults> {
    const query: Query = {
      ...filterQuery({ site: opts.site, language: opts.language, kind: opts.kind, origin: opts.origin, tag: opts.tag, createdAfter: opts.createdAfter, createdBefore: opts.createdBefore, shared: opts.shared }),
      q,
      recording: opts.recording,
      transcription: opts.transcription,
    };
    return this.#t.json('GET', '/v1/search/vector', { query });
  }
}

export type VectorSearchOptions = Omit<SearchOptions, 'broadcasts' | 'listenerTokens' | 'lang' | 'limit'>;

export interface Me {
  userId?: string | null;
  apiKeyId?: string | null;
  displayName: string;
  principalId: string;
  principals: unknown[];
  scopes: string[];
}

export class MeApi {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  get(): Promise<Me> {
    return this.#t.json('GET', '/v1/me');
  }
}

export interface ConnectTokenInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface ConnectToken {
  access_token: string;
  token_type: 'api_key';
  key_id: string;
  scope: string;
  account: { name: string };
}

export class Connect {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  token(input: ConnectTokenInput, opts: CallOptions = {}): Promise<ConnectToken> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    });
    return this.#t.json('POST', '/v1/connect/token', { body, anonymous: true, noRetry: true, oauthErrors: true, signal: opts.signal });
  }
}

export interface PageOptions {
  cursor?: string;
  limit?: number;
}

export interface UsageOptions {
  startDate?: string;
  endDate?: string;
  tz?: string;
}

export interface UsageChargesOptions extends UsageOptions, PageOptions {
  kind?: 'file' | 'live';
  source?: string;
}

export class Billing {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  get(): Promise<BillingView> {
    return this.#t.json('GET', '/v1/billing');
  }
  plans(): Promise<PlanList> {
    return this.#t.json('GET', '/v1/billing/plans');
  }
  ledger(opts: PageOptions = {}): Promise<LedgerPage> {
    return this.#t.json('GET', '/v1/billing/ledger', { query: { cursor: opts.cursor, limit: opts.limit } });
  }
  charges(opts: PageOptions = {}): Promise<ChargePage> {
    return this.#t.json('GET', '/v1/billing/charges', { query: { cursor: opts.cursor, limit: opts.limit } });
  }
  createCheckout(req: CreateCheckout, opts: CallOptions = {}): Promise<CheckoutView> {
    return this.#t.json('POST', '/v1/billing/checkouts', { body: req, ...opts });
  }
  getCheckout(id: string): Promise<CheckoutView> {
    return this.#t.json('GET', `/v1/billing/checkouts/${seg(id)}`);
  }
  cancelSubscription(): Promise<SubscriptionView> {
    return this.#t.json('POST', '/v1/billing/subscription/cancel');
  }
  uncancelSubscription(): Promise<SubscriptionView> {
    return this.#t.json('POST', '/v1/billing/subscription/uncancel');
  }
  setAutoTopUp(req: AutoTopUpSettings): Promise<AutoTopUpView> {
    return this.#t.json('PUT', '/v1/billing/auto-top-up', { body: req });
  }
  portal(): Promise<PortalLink> {
    return this.#t.json('GET', '/v1/billing/portal');
  }
  retryAutoTopUp(): Promise<AutoTopUpView> {
    return this.#t.json('POST', '/v1/billing/auto-top-up/retry');
  }
  setLowBalanceAlert(req: LowBalanceAlertSettings): Promise<LowBalanceAlertView> {
    return this.#t.json('PUT', '/v1/billing/low-balance-alert', { body: req });
  }
  setInterval(req: SetInterval): Promise<SubscriptionView> {
    return this.#t.json('POST', '/v1/billing/subscription/interval', { body: req });
  }
  optInYearly(req: YearlyOptIn): Promise<SubscriptionView> {
    return this.#t.json('POST', '/v1/billing/subscription/yearly-opt-in', { body: req });
  }
  unsetInterval(): Promise<SubscriptionView> {
    return this.#t.json('DELETE', '/v1/billing/subscription/interval');
  }
  usage(opts: UsageOptions = {}): Promise<UsageReport> {
    return this.#t.json('GET', '/v1/billing/usage', { query: { startDate: opts.startDate, endDate: opts.endDate, tz: opts.tz } });
  }
  usageCharges(opts: UsageChargesOptions = {}): Promise<UsageChargePage> {
    const query = { startDate: opts.startDate, endDate: opts.endDate, tz: opts.tz, kind: opts.kind, source: opts.source, cursor: opts.cursor, limit: opts.limit };
    return this.#t.json('GET', '/v1/billing/usage/charges', { query });
  }
  payments(opts: PageOptions = {}): Promise<PaymentPage> {
    return this.#t.json('GET', '/v1/billing/payments', { query: { cursor: opts.cursor, limit: opts.limit } });
  }
  paymentDocument(id: string): Promise<PaymentDocument> {
    return this.#t.json('GET', `/v1/billing/payments/${seg(id)}/document`);
  }
  paymentMethods(): Promise<PaymentMethodList> {
    return this.#t.json('GET', '/v1/billing/payment-methods');
  }
  async deletePaymentMethod(id: string): Promise<void> {
    await this.#t.json('DELETE', `/v1/billing/payment-methods/${seg(id)}`);
  }
  managePaymentMethods(): Promise<PortalLink> {
    return this.#t.json('POST', '/v1/billing/payment-methods/manage');
  }
  details(): Promise<BillingDetails> {
    return this.#t.json('GET', '/v1/billing/details');
  }
  setDetails(req: BillingDetails): Promise<BillingDetails> {
    return this.#t.json('PUT', '/v1/billing/details', { body: req });
  }
  checkPromoCode(req: CheckPromoCode): Promise<PromoCodeView> {
    return this.#t.json('POST', '/v1/billing/promo-codes/check', { body: req });
  }
}

export class Languages {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  list(): Promise<LanguageLists> {
    return this.#t.json('GET', '/v1/languages');
  }
}

export class Rtmp {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  status(): Promise<RtmpStatus> {
    return this.#t.json('GET', '/v1/rtmp');
  }
  createKey(req: CreateAppStreamKey): Promise<CreatedAppStreamKey> {
    return this.#t.json('POST', '/v1/rtmp/keys', { body: req });
  }
  async listKeys(): Promise<AppStreamKey[]> {
    const r = await this.#t.json<{ keys?: AppStreamKey[] }>('GET', '/v1/rtmp/keys');
    return r.keys ?? [];
  }
  async deleteKey(id: string): Promise<void> {
    await this.#t.json('DELETE', `/v1/rtmp/keys/${seg(id)}`);
  }
}

export class Events {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  async account(): Promise<WsLike> {
    return openWebSocket(this.#t.wsUrl('/v1/events'), await this.#t.bearer());
  }
}

export class Meta {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  health(): Promise<Health> {
    return this.#t.json('GET', '/v1/health');
  }
  openapi(): Promise<Record<string, unknown>> {
    return this.#t.json('GET', '/v1/openapi.json');
  }
  clientPolicy(client: ClientApp): Promise<ClientPolicy> {
    return this.#t.json('GET', `/v1/clients/${encodeURIComponent(client)}`);
  }
}
