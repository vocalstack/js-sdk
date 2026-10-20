import type {
  AppStreamKey,
  AudioSourceCheck,
  Batch,
  BatchPage,
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
  CreateBatch,
  CreateLiveTranscription,
  CreateBroadcast,
  CreateShareLink,
  CreateTranscription,
  CreateVoiceFromSpeaker,
  CreatedAppStreamKey,
  ChargePage,
  ExportFormat,
  Health,
  LanguageLists,
  LedgerPage,
  LinkProbe,
  PatchVoice,
  PlanList,
  PublishGrant,
  Recording,
  RecordingEvent,
  RecordingEvents,
  RecordingPage,
  RetranscribeLine,
  RtmpStatus,
  SearchResults,
  SettingsPatch,
  ShareLink,
  StartRecording,
  StartJob,
  SummaryStatus,
  Transcription,
  TranscriptionJob,
  TranscriptionPage,
  TranscriptSnapshot,
  UpdateBroadcast,
  UpdateTranscription,
  UpdateShareLink,
  UploadRecording,
  Voice,
  VoiceCatalogue,
  VoiceTrack,
} from '@vocalstack/contract';

import { VocalStackError } from './errors.js';
import { listenerQuery, seg, Transport, type CallOptions, type Query, type ReadAs } from './http.js';
import { RealtimeSession, type ConnectOptions } from './realtime.js';
import { Subscription, type SubscribeOptions } from './subscription.js';
import { openWebSocket, type WsLike } from './ws.js';

/** A file to upload: a `Blob`/`File`, bytes, or (Node) a path. */
export type Upload = Blob | Uint8Array | ArrayBuffer | string;

/** Which of a principal's broadcasts or transcriptions a list returns
 * (`?lifecycle=`): `all` is the active and the archived in one answer. */
export type LifecycleFilter = 'active' | 'archived' | 'all';

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

/** Every item of a paged list: each page asked for with the previous
 * page's `nextCursor` until one comes back without it. */
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

/** One page of a broadcast's or a transcription's recordings. */
export interface RecordingPageOptions extends PageOptions {
  lifecycle?: 'active' | 'archived';
}

/** What broadcasts and transcriptions have in common: both hold
 * recordings and share links. */
abstract class ParentResource<T, U> {
  protected readonly t: Transport;
  protected abstract readonly base: '/v1/broadcasts' | '/v1/transcriptions';
  /** The list's key: what it holds. */
  protected abstract readonly key: 'broadcasts' | 'transcriptions';

  constructor(t: Transport) {
    this.t = t;
  }

  protected p(id: string, rest = ''): string {
    return `${this.base}/${seg(id)}${rest}`;
  }

  /** Every one, newest first: a paged list is read to its last page
   * (`transcriptions.listPage` reads one). */
  list(lifecycle: LifecycleFilter = 'active'): Promise<T[]> {
    return allPages(async (cursor) => {
      const r = await this.t.json<Partial<Record<'broadcasts' | 'transcriptions', T[]>> & { nextCursor?: string | null }>('GET', this.base, { query: { lifecycle, cursor } });
      return { items: r[this.key], nextCursor: r.nextCursor };
    });
  }
  get(id: string): Promise<T> {
    return this.t.json('GET', this.p(id));
  }
  /** Rename, change the default capture settings (a broadcast: also its access, password or link). */
  update(id: string, req: U): Promise<T> {
    return this.t.json('PATCH', this.p(id), { body: req });
  }
  /** Hidden, its links dead, its data kept until `restore` or `purge`. */
  archive(id: string): Promise<T> {
    return this.t.json('POST', this.p(id, '/archive'));
  }
  restore(id: string): Promise<T> {
    return this.t.json('POST', this.p(id, '/restore'));
  }
  /** Delete an archived one and everything in it, for good. */
  async purge(id: string): Promise<void> {
    await this.t.json('POST', this.p(id, '/purge'));
  }
  /** Every recording, newest first (every page of `listRecordingsPage`). */
  listRecordings(id: string, lifecycle: 'active' | 'archived' = 'active'): Promise<Recording[]> {
    return allPages(async (cursor) => {
      const r = await this.listRecordingsPage(id, { lifecycle, cursor });
      return { items: r.recordings, nextCursor: r.nextCursor };
    });
  }
  /** One page of recordings, newest first: pass its `nextCursor` as `cursor` for the next. */
  listRecordingsPage(id: string, opts: RecordingPageOptions = {}): Promise<RecordingPage> {
    return this.t.json('GET', this.p(id, '/recordings'), { query: { lifecycle: opts.lifecycle, cursor: opts.cursor, limit: opts.limit } });
  }
  /** Start a live recording.  The grant's `streamUrl` is the publisher
   * socket (`vs.recordings.publish(grant)`).  A 409 `conflict` with
   * `details.takeover` means another device is recording: retry with
   * `{ takeover: true }` to record here instead. */
  startRecording(id: string, req: StartRecording = {}, call: CallOptions = {}): Promise<PublishGrant> {
    return this.t.json('POST', this.p(id, '/recordings'), { body: req, ...call });
  }
  async listShareLinks(id: string): Promise<ShareLink[]> {
    const r = await this.t.json<{ links?: ShareLink[] }>('GET', this.p(id, '/share-links'));
    return r.links ?? [];
  }
  createShareLink(id: string, req: CreateShareLink): Promise<ShareLink> {
    return this.t.json('POST', this.p(id, '/share-links'), { body: req });
  }
  /** The events socket a waiting screen needs: `recording.started` (it is
   * live), `recording.ended`, `job.progress`, `stream.ingest`.
   * Each names the transcription the recording is made in (`transcriptionId`). */
  async events(id: string, as: ReadAs & { asOwner?: boolean } = {}): Promise<WsLike> {
    const token = as.asOwner === false ? undefined : await this.t.bearer();
    return openWebSocket(this.t.wsUrl(this.p(id, '/events'), listenerQuery(as)), token);
  }
}

/** `vs.broadcasts`: the links listeners open (design 77). */
export class Broadcasts extends ParentResource<Broadcast, UpdateBroadcast> {
  protected readonly base = '/v1/broadcasts' as const;
  protected readonly key = 'broadcasts' as const;

  create(req: CreateBroadcast, call: CallOptions = {}): Promise<Broadcast> {
    return this.t.json('POST', this.base, { body: req, ...call });
  }
  /** Give a broadcast a stream it can record from (a YouTube live, an
   * internet radio address).  Returns the broadcast. */
  addAudioSource(id: string, req: CreateAudioSource): Promise<Broadcast> {
    return this.t.json('POST', this.p(id, '/audio-sources'), { body: req });
  }
  removeAudioSource(id: string, sourceId: string): Promise<Broadcast> {
    return this.t.json('DELETE', this.p(id, `/audio-sources/${seg(sourceId)}`));
  }
  /** Whether that source can be recorded right now; `fresh` skips the short cache. */
  checkAudioSource(id: string, sourceId: string, opts: { fresh?: boolean } = {}): Promise<AudioSourceCheck> {
    return this.t.json('GET', this.p(id, `/audio-sources/${seg(sourceId)}/check`), { query: { fresh: opts.fresh || undefined } });
  }
}

export type CreateTranscriptionInput = CreateTranscription & {
  /** The file to transcribe; omit it and set `url` to have the server fetch a link. */
  file?: Upload;
  /** The upload's file name, when `file` does not carry one. */
  fileName?: string;
};

/** `vs.transcriptions`: a file, a link, a microphone or a stream, transcribed and stored. */
export class Transcriptions extends ParentResource<Transcription, UpdateTranscription> {
  protected readonly base = '/v1/transcriptions' as const;
  protected readonly key = 'transcriptions' as const;

  /** One page of transcriptions, newest first: pass its `nextCursor` as
   * `cursor` for the next; the last page has none. */
  listPage(opts: PageOptions & { lifecycle?: LifecycleFilter } = {}): Promise<TranscriptionPage> {
    return this.t.json('GET', this.base, { query: { lifecycle: opts.lifecycle, cursor: opts.cursor, limit: opts.limit } });
  }
  /** A file or link recording in this transcription: no live phase, transcribed at full speed.
   * It has no job: open the grant's socket with `vs.recordings.publish(grant)` (with `url`
   * the server fetches the link) and read it until the session is done. */
  uploadRecording(id: string, req: UploadRecording = {}, call: CallOptions = {}): Promise<PublishGrant> {
    return this.t.json('POST', this.p(id, '/recordings/upload'), { body: req, ...call });
  }

  /** From a file (`file`) or a public link (`url`).  The answer's
   * `job.recordingId` is the job: `vs.jobs.wait(recordingId)`,
   * then `vs.recordings.transcript(recordingId)`. */
  async create(req: CreateTranscriptionInput, call: CallOptions = {}): Promise<Transcription> {
    const { file, fileName, ...options } = req;
    if (file === undefined) return this.t.json('POST', this.base, { body: options, ...call });
    const { blob, name } = await toBlob(file);
    const fd = new FormData();
    fd.append('options', JSON.stringify(options));
    fd.append('file', blob, fileName ?? name ?? 'upload');
    return this.t.json('POST', this.base, { body: fd, ...call });
  }
  /** `create({ url, ...opts })`. */
  createFromUrl(url: string, opts: Omit<CreateTranscription, 'url'> = {}, call: CallOptions = {}): Promise<Transcription> {
    return this.create({ ...opts, url }, call);
  }
  /** A transcription captured as it is spoken: a microphone, or a stream
   * the server pulls.  Created idle: `startRecording(id)` starts it. */
  createLive(req: CreateLiveTranscription, call: CallOptions = {}): Promise<Transcription> {
    return this.t.json('POST', `${this.base}/live`, { body: req, ...call });
  }
  /** Whether a link is live (a live transcription) or a file. */
  probe(url: string): Promise<LinkProbe> {
    return this.t.json('GET', `${this.base}/probe`, { query: { url } });
  }
  /** Feed a broadcast from a live transcription.  Returns the transcription. */
  attachBroadcast(id: string, broadcastId: string): Promise<Transcription> {
    return this.t.json('PUT', this.p(id, `/broadcasts/${seg(broadcastId)}`));
  }
  detachBroadcast(id: string, broadcastId: string): Promise<Transcription> {
    return this.t.json('DELETE', this.p(id, `/broadcasts/${seg(broadcastId)}`));
  }
}

/** What `batches.addFile` takes: a file (`file`) or a public link (`url`),
 * and of the transcription options only these (the settings are the batch's). */
export type AddBatchFileInput = Pick<CreateTranscription, 'url' | 'name' | 'startS' | 'endS' | 'durationS'> & {
  /** The file to add; omit it and set `url` to have the server fetch a link. */
  file?: Upload;
  /** The upload's file name, when `file` does not carry one. */
  fileName?: string;
};

/** `vs.batches`: several files transcribed together, for less than a
 * transcription each (one create, one minimum charge).  Create a batch, add
 * each file or link with `addFile`, then `start` it; `get` shows its files
 * (each a transcription with its job) and their counts.  A batch's files get
 * no summary, title, share link or spoken translations. */
export class Batches {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  #p(id: string, rest = '') {
    return `/v1/batches/${seg(id)}${rest}`;
  }

  /** An open batch, ready for files (`name` defaults to "Batch of <date>"). */
  create(req: CreateBatch = {}, call: CallOptions = {}): Promise<Batch> {
    return this.#t.json('POST', '/v1/batches', { body: req, ...call });
  }
  /** Every batch, newest first (every page of `listPage`); each with its counts, not its files. */
  list(): Promise<Batch[]> {
    return allPages(async (cursor) => {
      const r = await this.listPage({ cursor });
      return { items: r.batches, nextCursor: r.nextCursor };
    });
  }
  /** One page of batches, newest first: pass its `nextCursor` as `cursor` for the next. */
  listPage(opts: PageOptions = {}): Promise<BatchPage> {
    return this.#t.json('GET', '/v1/batches', { query: { cursor: opts.cursor, limit: opts.limit } });
  }
  /** A batch with its files (`files`, each a transcription with its job), in the order they were added. */
  get(id: string): Promise<Batch> {
    return this.#t.json('GET', this.#p(id));
  }
  /** Discard a batch that was never started, with its files (nothing was charged). */
  async delete(id: string): Promise<void> {
    await this.#t.json('DELETE', this.#p(id));
  }
  /** Add one file (`file`) or link (`url`) to an open batch: a transcription
   * of its own (`batchId`), waiting for the batch's `start`. */
  async addFile(id: string, req: AddBatchFileInput, call: CallOptions = {}): Promise<Transcription> {
    const { file, fileName, ...options } = req;
    if (file === undefined) return this.#t.json('POST', this.#p(id, '/files'), { body: options, ...call });
    const { blob, name } = await toBlob(file);
    const fd = new FormData();
    fd.append('options', JSON.stringify(options));
    fd.append('file', blob, fileName ?? name ?? 'upload');
    return this.#t.json('POST', this.#p(id, '/files'), { body: fd, ...call });
  }
  /** `addFile(id, { url, ...opts })`. */
  addUrl(id: string, url: string, opts: Omit<AddBatchFileInput, 'url' | 'file' | 'fileName'> = {}, call: CallOptions = {}): Promise<Transcription> {
    return this.addFile(id, { ...opts, url }, call);
  }
  /** Seal the batch and queue its files, longest first; `wait` follows it to the end. */
  start(id: string, call: CallOptions = {}): Promise<Batch> {
    return this.#t.json('POST', this.#p(id, '/start'), call);
  }
  /** Every finished file's transcript in one `format` (as `recordings.export`
   * makes one), in one zip, as a `Response`: `.arrayBuffer()` it.  Files
   * still running or failed are left out. */
  export(id: string, format: ExportFormat): Promise<Response> {
    return this.#t.raw('GET', this.#p(id, '/export'), { headers: { accept: '*/*' }, query: { format } });
  }
  /** Stop every file not finished yet: queued files never start, a running
   * one is cancelled and billed for what it transcribed. */
  stop(id: string): Promise<Batch> {
    return this.#t.json('POST', this.#p(id, '/stop'));
  }
  /** Poll a started batch until it is `done` (every file finished or
   * failed) or `stopped`, and return it with its files.  It does not throw
   * on a failed file: check `counts.failed` and each file's `job.state`.
   * `onProgress` sees every read, the last one included. */
  async wait(
    id: string,
    opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal; onProgress?(batch: Batch): void } = {},
  ): Promise<Batch> {
    const interval = opts.intervalMs ?? 5000;
    const deadline = opts.timeoutMs ? Date.now() + opts.timeoutMs : Infinity;
    for (;;) {
      const batch = await this.get(id);
      opts.onProgress?.(batch);
      // Closed: every file over (a stopped batch's running file too).
      if ((batch.state === 'done' || batch.state === 'stopped') && batch.finishedAt) return batch;
      if (batch.state === 'open') throw new VocalStackError('invalid_state', 'the batch is open: start it before waiting for it');
      if (Date.now() + interval > deadline) throw new VocalStackError('timeout', `batch still ${batch.state} after ${opts.timeoutMs} ms`, { retryable: true });
      if (opts.signal?.aborted) throw opts.signal.reason ?? new Error('aborted');
      await new Promise((r) => setTimeout(r, interval));
    }
  }
}

/** `vs.recordings`: one take, live or uploaded. */
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
  /** Only from paused. */
  stop(id: string, reason?: string): Promise<Recording> {
    return this.#t.json('POST', this.#p(id, '/stop'), { body: { reason } });
  }
  settings(id: string, patch: SettingsPatch): Promise<Recording> {
    return this.#t.json('PATCH', this.#p(id, '/settings'), { body: patch });
  }
  /** A new publisher grant for a recording that is already live. */
  publishToken(id: string, opts: { takeover?: boolean } = {}): Promise<PublishGrant> {
    return this.#t.json('POST', this.#p(id, '/publish-token'), { body: { takeover: opts.takeover ?? false } });
  }
  /** Open the publisher socket a grant names and wait until it is ready:
   * send raw PCM (f32le, 16 kHz, mono) with `sendAudio`, end with `eof()`. */
  publish(grant: PublishGrant, opts: ConnectOptions = {}): Promise<RealtimeSession> {
    if (!grant.streamUrl) throw new VocalStackError('invalid_state', 'this grant has no streamUrl (an upload recording has no publisher socket)');
    return RealtimeSession.connect({
      sessionId: grant.sessionId ?? grant.recording.id,
      streamUrl: grant.streamUrl,
      readyDeadlineMs: opts.readyDeadlineMs ?? this.#t.opts.readyDeadlineMs,
      onLoading: opts.onLoading,
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
  /** The transcript: segments (with word timings), sentences and speakers,
   * up to `lastSeq`; `after` continues from a cursor, `lang` reads it translated. */
  transcript(id: string, opts: { after?: number; lang?: string; asListener?: boolean } & ReadAs = {}): Promise<TranscriptSnapshot> {
    return this.#t.json('GET', this.#p(id, '/transcript'), {
      query: { ...listenerQuery(opts), after: opts.after, lang: opts.lang, role: opts.asListener ? 'listener' : undefined },
    });
  }
  /** Translate the given sentences (at most 40 ids per call); the answer
   * carries only what this call translated. */
  translation(id: string, lang: string, sentences: number[] = [], as?: ReadAs): Promise<{ lang: string; translations: Record<string, string> }> {
    return this.#t.json('GET', this.#p(id, '/translation'), {
      query: { ...listenerQuery(as), lang, sentences: sentences.length ? sentences.join(',') : undefined },
    });
  }
  /** Queue the AI title and summary of a finished recording. */
  summarize(id: string, call: CallOptions = {}): Promise<SummaryStatus> {
    return this.#t.json('POST', this.#p(id, '/summarize'), call);
  }
  /** The title and summary as they stand, in `lang` when given. */
  summary(id: string, opts: { lang?: string } & ReadAs = {}): Promise<SummaryStatus> {
    return this.#t.json('GET', this.#p(id, '/summary'), { query: { ...listenerQuery(opts), lang: opts.lang } });
  }
  /** An export file (JSON, SRT, XLSX, PDF) as a `Response`: `.text()` or
   * `.arrayBuffer()` it.  `lang` makes it read in that language. */
  export(id: string, format: ExportFormat, opts: { lang?: string } & ReadAs = {}): Promise<Response> {
    return this.#t.raw('GET', this.#p(id, '/export'), { headers: { accept: '*/*' }, query: { ...listenerQuery(opts), format, lang: opts.lang } });
  }
  /** The export as a plain link, for a browser download with a browser
   * access token (it rides in the query).  Never use it with an API key:
   * the API refuses a key in a URL. */
  async exportUrl(id: string, format: ExportFormat, opts: { lang?: string; shareCode?: string; /** A broadcast listener's, once the recording has ended. */ listenerToken?: string } = {}): Promise<string> {
    const token = opts.shareCode || opts.listenerToken ? undefined : await this.#t.bearer();
    return this.#t.url(this.#p(id, '/export'), { format, lang: opts.lang, shareCode: opts.shareCode, listenerToken: opts.listenerToken, access_token: token });
  }
  /** The signed media URL the server redirects to.  `kind`: `delivery`
   * (default), `master`, or `source` (a transcription's original upload). */
  async audioUrl(id: string, opts: { kind?: 'delivery' | 'master' | 'source' | 'video'; lang?: string; format?: string } & ReadAs = {}): Promise<string> {
    const res = await this.#t.raw('GET', this.#p(id, '/audio'), {
      query: { ...listenerQuery(opts), kind: opts.kind, lang: opts.lang, format: opts.format },
    });
    const location = res.headers.get('location');
    if (!location) throw new VocalStackError('not_found', 'no signed URL in the redirect');
    return location;
  }
  /** A stretch of the recording's audio, `startS` to `endS` seconds (at most 120 s). */
  clip(id: string, startS: number, endS: number, as?: ReadAs): Promise<Response> {
    return this.#t.raw('GET', this.#p(id, '/audio/clip'), { headers: { accept: '*/*' }, query: { ...listenerQuery(as), startS, endS } });
  }
  /** The synthesized voice tracks of a recording (per language). */
  voice(id: string, lang?: string, as?: ReadAs): Promise<VoiceTrack[]> {
    return this.#t.json('GET', this.#p(id, '/voice'), { query: { ...listenerQuery(as), lang } });
  }
  /** Synthesize the voice track in these languages. */
  renderVoice(id: string, langs: string[], call: CallOptions = {}): Promise<VoiceTrack[]> {
    return this.#t.json('POST', this.#p(id, '/voice'), { body: { langs }, ...call });
  }
  /** One sentence spoken in `lang`. */
  voiceClip(id: string, sentence: number, lang: string, opts: { format?: 'ogg' | 'caf' } & ReadAs = {}): Promise<Response> {
    return this.#t.raw('GET', this.#p(id, `/voice/${seg(sentence)}`), { headers: { accept: '*/*' }, query: { ...listenerQuery(opts), lang, format: opts.format } });
  }
  /** A short-lived token for the recording's media URLs. */
  mediaToken(id: string): Promise<{ token: string; expiresAt: string }> {
    return this.#t.json('GET', this.#p(id, '/media-token'));
  }
  /** Name a speaker (the diarizer's index); `null` clears the name. */
  async nameSpeaker(id: string, speaker: number, name: string | null): Promise<void> {
    await this.#t.json('PUT', this.#p(id, `/speakers/${seg(speaker)}`), { body: { name } });
  }
  /** The durable event log with wall times (owner only): every event
   * after `after` (a `seq`; the whole log without it), read `limit` a page. */
  events(id: string, opts: { after?: number; limit?: number } = {}): Promise<RecordingEvent[]> {
    return allPages(async (cursor) => {
      const r = await this.eventsPage(id, cursor ? { cursor, limit: opts.limit } : { after: opts.after, limit: opts.limit });
      return { items: r.events, nextCursor: r.nextCursor };
    });
  }
  /** One page of the event log (500 by default, 1000 at most): from `after`
   * a `seq`, or the previous page's `nextCursor` as `cursor`. */
  eventsPage(id: string, opts: { cursor?: string; after?: number; limit?: number } = {}): Promise<RecordingEvents> {
    return this.#t.json('GET', this.#p(id, '/events'), { query: { cursor: opts.cursor, after: opts.after, limit: opts.limit } });
  }
  /** Attach to the live fan-out; resolves once the backfill snapshot is in place. */
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

const TERMINAL: ReadonlySet<string> = new Set(['done', 'failed', 'stopped', 'cropping']);

/** `vs.jobs`: the transcription job of a file or link recording
 * (`/v1/recordings/{id}/job`).  States: queued, fetching, transcribing,
 * done, failed, and cropping (waiting for `start`). */
export class Jobs {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  get(recordingId: string): Promise<TranscriptionJob> {
    return this.#t.json('GET', `/v1/recordings/${seg(recordingId)}/job`);
  }
  /** Release a job waiting in `cropping`: the window to transcribe, in seconds. */
  start(recordingId: string, window: StartJob = {}): Promise<TranscriptionJob> {
    return this.#t.json('POST', `/v1/recordings/${seg(recordingId)}/job/start`, { body: window });
  }
  /** Re-queue a failed job from its stored source. */
  retry(recordingId: string): Promise<TranscriptionJob> {
    return this.#t.json('POST', `/v1/recordings/${seg(recordingId)}/job/retry`);
  }
  /** The file the server fetched for a link job waiting in `cropping`. */
  preview(recordingId: string): Promise<Response> {
    return this.#t.raw('GET', `/v1/recordings/${seg(recordingId)}/job/preview`, { headers: { accept: '*/*' } });
  }
  /** Poll until the job is `done`, `failed` or `cropping`, and return it.
   * It does not throw on `failed`: check `job.state` (and `job.error`).
   * `onProgress` sees every job read, the last one included: its `state`
   * and `progress` (`pct`, `processedS`, the fetch phase). */
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

/** `vs.corrections`: edits to a finished transcript, each revertible. */
export class Corrections {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  /** Every correction, newest first (every page of `listPage`). */
  list(recordingId: string): Promise<Correction[]> {
    return allPages(async (cursor) => {
      const r = await this.listPage(recordingId, { cursor });
      return { items: r.corrections, nextCursor: r.nextCursor };
    });
  }
  /** One page of corrections, newest first: pass its `nextCursor` as `cursor` for the next. */
  listPage(recordingId: string, opts: PageOptions = {}): Promise<CorrectionPage> {
    return this.#t.json('GET', `/v1/recordings/${seg(recordingId)}/corrections`, { query: { cursor: opts.cursor, limit: opts.limit } });
  }
  /** Apply a staged batch atomically; every target must be settled. */
  async apply(recordingId: string, batch: CorrectionBatch): Promise<Correction[]> {
    const r = await this.#t.json<{ corrections?: Correction[] }>('POST', `/v1/recordings/${seg(recordingId)}/corrections`, { body: batch });
    return r.corrections ?? [];
  }
  /** Read lines again with the language forced; lands as `line` corrections. */
  async retranscribe(recordingId: string, req: RetranscribeLine): Promise<Correction[]> {
    const r = await this.#t.json<{ corrections?: Correction[] }>('POST', `/v1/recordings/${seg(recordingId)}/retranscribe`, { body: req });
    return r.corrections ?? [];
  }
  revert(correctionId: string): Promise<Correction> {
    return this.#t.json('POST', `/v1/corrections/${seg(correctionId)}/revert`);
  }
}

/** `vs.shareLinks`: named public links to a transcription or broadcast
 * (create and list them on their owner). */
export class ShareLinks {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  update(id: string, req: UpdateShareLink): Promise<ShareLink> {
    return this.#t.json('PATCH', `/v1/share-links/${seg(id)}`, { body: req });
  }
  revoke(id: string): Promise<ShareLink> {
    return this.#t.json('DELETE', `/v1/share-links/${seg(id)}`);
  }
}

/** `vs.voices`: the account's cloned voices, and the catalogue a language offers. */
export class Voices {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  async list(): Promise<Voice[]> {
    const r = await this.#t.json<{ voices?: Voice[] }>('GET', '/v1/voices');
    return r.voices ?? [];
  }
  get(id: string): Promise<Voice> {
    return this.#t.json('GET', `/v1/voices/${seg(id)}`);
  }
  /** Build a voice from a sample (`sample`) or audio the server fetches
   * (`sampleUrl`).  Calling it asserts you have the speaker's permission,
   * unless `draft` (a draft is named and consented to later with `update`). */
  async create(
    req: { name: string; sample?: Upload; sampleUrl?: string; fileName?: string; gender?: 'male' | 'female'; color?: string; draft?: boolean },
    call: CallOptions = {},
  ): Promise<Voice> {
    const { sample, fileName, ...meta } = req;
    const form = new FormData();
    form.append('meta', JSON.stringify({ consent: !meta.draft, ...meta }));
    if (sample !== undefined) {
      const { blob, name } = await toBlob(sample);
      form.append('sample', blob, fileName ?? name ?? 'sample.webm');
    }
    return this.#t.json('POST', '/v1/voices', { body: form, ...call });
  }
  /** Build a voice from one speaker of a recording (asserts permission). */
  createFromSpeaker(req: Omit<CreateVoiceFromSpeaker, 'consent'>, call: CallOptions = {}): Promise<Voice> {
    return this.#t.json('POST', '/v1/voices/from-speaker', { body: { consent: true, ...req }, ...call });
  }
  /** Rename, recolour, switch off; `{ name, consent: true, draft: false }` finishes a draft. */
  update(id: string, patch: PatchVoice): Promise<Voice> {
    return this.#t.json('PATCH', `/v1/voices/${seg(id)}`, { body: patch });
  }
  async delete(id: string): Promise<void> {
    await this.#t.json('DELETE', `/v1/voices/${seg(id)}`);
  }
  /** The voices that can speak `lang`, best first (with a token, also the
   * account's ready clones).  `recording` also offers the cloned voices that
   * recording uses, to whoever may read it: its owner, or a listener with
   * `listenerToken` or `shareCode`. */
  available(lang: string, opts: { recording?: string; asOwner?: boolean } & ReadAs = {}): Promise<VoiceCatalogue> {
    return this.#t.json('GET', '/v1/voices/available', {
      query: { ...listenerQuery(opts), lang, recording: opts.recording },
      anonymous: opts.asOwner === false,
    });
  }
  /** A catalogue voice speaking `lang` (Ogg/Opus; `caf` for Apple). 202 while it is prepared. */
  preview(voice: string, lang: string, opts: { format?: 'ogg' | 'caf' } = {}): Promise<Response> {
    return this.#t.raw('GET', '/v1/voices/preview', { headers: { accept: '*/*' }, query: { voice, lang, format: opts.format } });
  }
  /** A cloned voice speaking `lang`; 409 while it is not ready.  With
   * `recording`, as it speaks in that recording, for whoever may read it
   * (its owner, or a listener with `listenerToken` or `shareCode`). */
  clonePreview(id: string, opts: { lang?: string; format?: 'ogg' | 'caf'; recording?: string; asOwner?: boolean } & ReadAs = {}): Promise<Response> {
    return this.#t.raw('GET', `/v1/voices/${seg(id)}/preview`, {
      headers: { accept: '*/*' },
      query: { ...listenerQuery(opts), lang: opts.lang, format: opts.format, recording: opts.recording },
      anonymous: opts.asOwner === false,
    });
  }
  /** The audio a voice was made from. */
  sample(id: string): Promise<Response> {
    return this.#t.raw('GET', `/v1/voices/${seg(id)}/sample`, { headers: { accept: '*/*' } });
  }
}

export interface SearchOptions {
  /** Only these broadcasts, by link (`code`): what a listener joined. */
  broadcasts?: string[];
  /** Listener tokens for the private ones among `broadcasts`. */
  listenerTokens?: string[];
  /** Only this recording. */
  recording?: string;
  lang?: string;
  limit?: number;
}

/** `vs.search`: full-text search over the caller's transcripts. */
export class Search {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  /** `q` is 2 or more characters. */
  query(q: string, opts: SearchOptions = {}): Promise<SearchResults> {
    const query: Query = {
      q,
      broadcasts: opts.broadcasts?.join(','),
      listenerTokens: opts.listenerTokens?.join(','),
      recording: opts.recording,
      lang: opts.lang,
      limit: opts.limit,
    };
    return this.#t.json('GET', '/v1/search', { query });
  }
}

export interface Me {
  userId?: string | null;
  apiKeyId?: string | null;
  displayName: string;
  principalId: string;
  principals: unknown[];
  scopes: string[];
}

/** `vs.me`: who the credential is. */
export class MeApi {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  get(): Promise<Me> {
    return this.#t.json('GET', '/v1/me');
  }
}

/** `vs.connect.token()`'s parameters: what the callback received and the
 * verifier the app made for the connect link. */
export interface ConnectTokenInput {
  /** The `code` the dashboard added to `redirect_uri` (single use, two minutes). */
  code: string;
  /** The PKCE verifier whose `BASE64URL(SHA256(verifier))` was the link's `code_challenge`. */
  codeVerifier: string;
  /** Exactly the `redirect_uri` of the connect link. */
  redirectUri: string;
}

/** The key a connect code was redeemed for (the wire's own field names). */
export interface ConnectToken {
  /** The new API key (`vs_key_…`): shown once, here; keep it on the server. */
  access_token: string;
  token_type: 'api_key';
  /** The key's id, as the API keys list and `GET /v1/me` (`apiKeyId`) show it. */
  key_id: string;
  /** The granted scopes, space-separated (`read write`). */
  scope: string;
  /** The account the key acts for. */
  account: { name: string };
}

/** `vs.connect`: one-click Connect, on the app's server. */
export class Connect {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  /** Redeem the `code` the dashboard sent to the app's `redirect_uri` for
   * an API key (OAuth 2.0 authorization code + PKCE).  No credential is
   * sent, even when the client has one, and the call is never retried:
   * the code works once.  A refusal is a `VocalStackError` whose `code` is
   * OAuth's `error` (`invalid_grant`: unknown, spent or expired code, or a
   * verifier or `redirect_uri` that does not match). */
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

/** A page of a list. */
export interface PageOptions {
  /** The `nextCursor` of the previous page. */
  cursor?: string;
  /** 1 to 200: 50 by default for the billing lists, 100 for the others. */
  limit?: number;
}

/** `vs.billing.usage()`'s range: inclusive days (`YYYY-MM-DD`) in `tz`. */
export interface UsageOptions {
  /** The first day (default: the first of this month); an earlier one than the account's is moved to it. */
  startDate?: string;
  /** The last day (default: today, the latest it may be). */
  endDate?: string;
  /** An IANA time zone (default `UTC`). */
  tz?: string;
}

/** `vs.billing.usageCharges()`: the usage report's range, its filters and a page. */
export interface UsageChargesOptions extends UsageOptions, PageOptions {
  /** Only `file` or only `live` charges (realtime sessions are live). */
  kind?: 'file' | 'live';
  /** Only `dashboard`'s charges or one API key's (its id). */
  source?: string;
}

/** `vs.billing`: the account's plan, credit balance and limits, the price
 *  list, the ledger, the per-recording charges, the usage report, the
 *  payments history, payment methods, invoice details and promo codes. */
export class Billing {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  /** The account: plan, rates, balance, limits, subscription, top-up URL. */
  get(): Promise<BillingView> {
    return this.#t.json('GET', '/v1/billing');
  }
  /** The visible plans with their current rates and limits (no credential needed). */
  plans(): Promise<PlanList> {
    return this.#t.json('GET', '/v1/billing/plans');
  }
  /** The ledger, newest first. */
  ledger(opts: PageOptions = {}): Promise<LedgerPage> {
    return this.#t.json('GET', '/v1/billing/ledger', { query: { cursor: opts.cursor, limit: opts.limit } });
  }
  /** The per-recording charges, newest first. */
  charges(opts: PageOptions = {}): Promise<ChargePage> {
    return this.#t.json('GET', '/v1/billing/charges', { query: { cursor: opts.cursor, limit: opts.limit } });
  }
  /** Open a checkout at the payment provider (a top-up or a subscription); send the customer to `url`.
   *  A signed-in person only, never an API key. */
  createCheckout(req: CreateCheckout, opts: CallOptions = {}): Promise<CheckoutView> {
    return this.#t.json('POST', '/v1/billing/checkouts', { body: req, ...opts });
  }
  /** A checkout's status (by its id or the provider's). */
  getCheckout(id: string): Promise<CheckoutView> {
    return this.#t.json('GET', `/v1/billing/checkouts/${seg(id)}`);
  }
  /** Cancel the subscription at the end of its period. */
  cancelSubscription(): Promise<SubscriptionView> {
    return this.#t.json('POST', '/v1/billing/subscription/cancel');
  }
  /** Take back a scheduled cancellation. */
  uncancelSubscription(): Promise<SubscriptionView> {
    return this.#t.json('POST', '/v1/billing/subscription/uncancel');
  }
  /** Turn auto top-up on (threshold and amount from `plans().autoTopUp`) or off. */
  setAutoTopUp(req: AutoTopUpSettings): Promise<AutoTopUpView> {
    return this.#t.json('PUT', '/v1/billing/auto-top-up', { body: req });
  }
  /** A link to the provider's customer portal (payment methods, invoices, receipts). */
  portal(): Promise<PortalLink> {
    return this.#t.json('GET', '/v1/billing/portal');
  }
  /** Charge the configured auto top-up amount now (under the day's cap). */
  retryAutoTopUp(): Promise<AutoTopUpView> {
    return this.#t.json('POST', '/v1/billing/auto-top-up/retry');
  }
  /** Turn the low-balance email on or off and set its line. */
  setLowBalanceAlert(req: LowBalanceAlertSettings): Promise<LowBalanceAlertView> {
    return this.#t.json('PUT', '/v1/billing/low-balance-alert', { body: req });
  }
  /** Renew `month`ly or `year`ly from the next period, at `subscription.switchPrices` (needs `acceptTerms` and `noNewWithdrawalPeriodShown`). */
  setInterval(req: SetInterval): Promise<SubscriptionView> {
    return this.#t.json('POST', '/v1/billing/subscription/interval', { body: req });
  }
  /** Keep the subscription by switching to yearly when monthly billing is withdrawn (`subscription.yearlyOptIn`). */
  optInYearly(req: YearlyOptIn): Promise<SubscriptionView> {
    return this.#t.json('POST', '/v1/billing/subscription/yearly-opt-in', { body: req });
  }
  /** Take back a scheduled interval switch. */
  unsetInterval(): Promise<SubscriptionView> {
    return this.#t.json('DELETE', '/v1/billing/subscription/interval');
  }
  /** What the account spent per day, source (API key or Dashboard) and kind. */
  usage(opts: UsageOptions = {}): Promise<UsageReport> {
    return this.#t.json('GET', '/v1/billing/usage', { query: { startDate: opts.startDate, endDate: opts.endDate, tz: opts.tz } });
  }
  /** The usage report's charges one by one, newest first, with how many match and their total. */
  usageCharges(opts: UsageChargesOptions = {}): Promise<UsageChargePage> {
    const query = { startDate: opts.startDate, endDate: opts.endDate, tz: opts.tz, kind: opts.kind, source: opts.source, cursor: opts.cursor, limit: opts.limit };
    return this.#t.json('GET', '/v1/billing/usage/charges', { query });
  }
  /** The payments history, newest first. */
  payments(opts: PageOptions = {}): Promise<PaymentPage> {
    return this.#t.json('GET', '/v1/billing/payments', { query: { cursor: opts.cursor, limit: opts.limit } });
  }
  /** A payment's invoice or receipt: `{url}`, or `{pending: true}` while the provider makes it. */
  paymentDocument(id: string): Promise<PaymentDocument> {
    return this.#t.json('GET', `/v1/billing/payments/${seg(id)}/document`);
  }
  /** The saved payment methods. */
  paymentMethods(): Promise<PaymentMethodList> {
    return this.#t.json('GET', '/v1/billing/payment-methods');
  }
  /** Remove a saved payment method. */
  async deletePaymentMethod(id: string): Promise<void> {
    await this.#t.json('DELETE', `/v1/billing/payment-methods/${seg(id)}`);
  }
  /** A link to the provider's portal to add a card or choose the default. */
  managePaymentMethods(): Promise<PortalLink> {
    return this.#t.json('POST', '/v1/billing/payment-methods/manage');
  }
  /** The invoice details. */
  details(): Promise<BillingDetails> {
    return this.#t.json('GET', '/v1/billing/details');
  }
  /** Save the invoice details. */
  setDetails(req: BillingDetails): Promise<BillingDetails> {
    return this.#t.json('PUT', '/v1/billing/details', { body: req });
  }
  /** What a promo code gives for a top-up or a subscription. */
  checkPromoCode(req: CheckPromoCode): Promise<PromoCodeView> {
    return this.#t.json('POST', '/v1/billing/promo-codes/check', { body: req });
  }
}

/** `vs.languages`. */
export class Languages {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  /** Spoken and translation languages. */
  list(): Promise<LanguageLists> {
    return this.#t.json('GET', '/v1/languages');
  }
}

/** `vs.rtmp`. */
export class Rtmp {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  /** The account's RTMP ingest: server URL (RTMPS where available), the stream key (in full only in the answer that made it, `maskedStreamKey` after), and whether an encoder is sending. */
  status(): Promise<RtmpStatus> {
    return this.#t.json('GET', '/v1/rtmp');
  }
  /** A stream key of the app's own, beside the account's: `streamKey` is in full in this answer only. It works while the API key that made it does. */
  createKey(req: CreateAppStreamKey): Promise<CreatedAppStreamKey> {
    return this.#t.json('POST', '/v1/rtmp/keys', { body: req });
  }
  /** The account's app stream keys, oldest first: masked, each with whether an encoder is sending on it (`live`, `audio`). */
  async listKeys(): Promise<AppStreamKey[]> {
    const r = await this.#t.json<{ keys?: AppStreamKey[] }>('GET', '/v1/rtmp/keys');
    return r.keys ?? [];
  }
  /** Delete an app stream key: an encoder publishing on it is dropped within seconds. */
  async deleteKey(id: string): Promise<void> {
    await this.#t.json('DELETE', `/v1/rtmp/keys/${seg(id)}`);
  }
}

/** `vs.events`: the account socket. */
export class Events {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  /** `events.ready`, then `lists.changed` whenever one of the owner's
   * lists of broadcasts or transcriptions is out of date: re-read them. */
  async account(): Promise<WsLike> {
    return openWebSocket(this.#t.wsUrl('/v1/events'), await this.#t.bearer());
  }
}

/** `vs.meta`. */
export class Meta {
  readonly #t: Transport;
  constructor(t: Transport) {
    this.#t = t;
  }
  health(): Promise<Health> {
    return this.#t.json('GET', '/v1/health');
  }
  /** The OpenAPI document this SDK is generated from. */
  openapi(): Promise<Record<string, unknown>> {
    return this.#t.json('GET', '/v1/openapi.json');
  }
}
