import { Transport, type ClientOptions } from './http.js';
import { Realtime } from './realtime.js';
import {
  Batches,
  Billing,
  Broadcasts,
  Connect,
  Corrections,
  Events,
  Jobs,
  Languages,
  MeApi,
  Meta,
  Recordings,
  Rtmp,
  Search,
  ShareLinks,
  Tags,
  Transcriptions,
  Voices,
} from './resources.js';

export type { ClientOptions, CallOptions, ReadAs, Query } from './http.js';
export { DEFAULT_BASE_URL } from './http.js';
export { VocalStackError } from './errors.js';
export type { ConnectTokenErrorCode, VocalStackErrorOptions } from './errors.js';
export { RealtimeSession } from './realtime.js';
export type { ConnectParams, SessionEvent } from './realtime.js';
export type { FileInput } from './file.js';
export { Realtime, applySentence } from './realtime.js';
export type { ConnectOptions, TranscribeOptions, RealtimeTranscript } from './realtime.js';
export { Subscription } from './subscription.js';
export type { SubscribeOptions, SubscriptionEvent } from './subscription.js';
export type { WsLike } from './ws.js';
export {
  Batches,
  Broadcasts,
  Connect,
  Corrections,
  Events,
  Jobs,
  Languages,
  MeApi,
  Meta,
  Recordings,
  Rtmp,
  Search,
  ShareLinks,
  Tags,
  Transcriptions,
  Voices,
} from './resources.js';
export type { AddBatchFileInput, ConnectToken, ConnectTokenInput, CreateTranscriptionInput, LifecycleFilter, Me, PageOptions, RecordingPageOptions, SearchOptions, Upload, UsageChargesOptions, UsageOptions } from './resources.js';
export type * from '@vocalstack/contract';

export type VocalStackOptions = ClientOptions;

export class VocalStack {
  readonly baseUrl: string;
  readonly realtime: Realtime;
  readonly broadcasts: Broadcasts;
  readonly transcriptions: Transcriptions;
  readonly batches: Batches;
  readonly recordings: Recordings;
  readonly jobs: Jobs;
  readonly corrections: Corrections;
  readonly shareLinks: ShareLinks;
  readonly tags: Tags;
  readonly voices: Voices;
  readonly search: Search;
  readonly me: MeApi;
  readonly connect: Connect;
  readonly billing: Billing;
  readonly languages: Languages;
  readonly rtmp: Rtmp;
  readonly events: Events;
  readonly meta: Meta;

  constructor(opts: ClientOptions = {}) {
    const t = new Transport(opts);
    this.baseUrl = t.baseUrl;
    this.realtime = new Realtime(t);
    this.broadcasts = new Broadcasts(t);
    this.transcriptions = new Transcriptions(t);
    this.batches = new Batches(t);
    this.recordings = new Recordings(t);
    this.jobs = new Jobs(t);
    this.corrections = new Corrections(t);
    this.shareLinks = new ShareLinks(t);
    this.tags = new Tags(t);
    this.voices = new Voices(t);
    this.search = new Search(t);
    this.me = new MeApi(t);
    this.connect = new Connect(t);
    this.billing = new Billing(t);
    this.languages = new Languages(t);
    this.rtmp = new Rtmp(t);
    this.events = new Events(t);
    this.meta = new Meta(t);
  }
}
