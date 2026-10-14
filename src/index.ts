/**
 * The VocalStack SDK: one client, `VocalStack`, grouped by resource.
 *
 *   import { VocalStack } from '@vocalstack/sdk';
 *   const vs = new VocalStack({ apiKey: process.env.VOCALSTACK_API_KEY });
 *
 *   const tx = await vs.transcriptions.createFromUrl('https://example.com/talk.mp3');
 *   const job = await vs.jobs.wait(tx.job!.recordingId);
 *   const { sentences } = await vs.recordings.transcript(job.recordingId);
 *
 * What is what (the API's glossary): a realtime session is a signed token
 * plus one socket, nothing stored (`vs.realtime`); a broadcast is the link
 * listeners open; a transcription is a file, link, microphone or stream
 * transcribed and stored; a recording is one take inside either; a job is
 * a file or link recording's transcription work.
 */
import { Transport, type ClientOptions } from './http.js';
import { Realtime } from './realtime.js';
import {
  Billing,
  Broadcasts,
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
  Transcriptions,
  Voices,
} from './resources.js';

export type { ClientOptions, CallOptions, ReadAs, Query } from './http.js';
export { DEFAULT_BASE_URL } from './http.js';
export { VocalStackError } from './errors.js';
export type { VocalStackErrorOptions } from './errors.js';
export { RealtimeSession } from './realtime.js';
export type { ConnectParams, SessionEvent } from './realtime.js';
export type { FileInput } from './file.js';
export { Realtime, applySentence } from './realtime.js';
export type { ConnectOptions, TranscribeOptions, RealtimeTranscript } from './realtime.js';
export { Subscription } from './subscription.js';
export type { SubscribeOptions, SubscriptionEvent } from './subscription.js';
export type { WsLike } from './ws.js';
export {
  Broadcasts,
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
  Transcriptions,
  Voices,
} from './resources.js';
export type { CreateTranscriptionInput, LifecycleFilter, Me, PageOptions, RecordingPageOptions, SearchOptions, Upload } from './resources.js';
// Every schema type of the contract (Broadcast, Transcription, Recording,
// TranscriptSnapshot, ServerFrame, ...), generated from /v1/openapi.json.
export type * from '@vocalstack/contract';

export type VocalStackOptions = ClientOptions;

export class VocalStack {
  readonly baseUrl: string;
  readonly realtime: Realtime;
  readonly broadcasts: Broadcasts;
  readonly transcriptions: Transcriptions;
  readonly recordings: Recordings;
  readonly jobs: Jobs;
  readonly corrections: Corrections;
  readonly shareLinks: ShareLinks;
  readonly voices: Voices;
  readonly search: Search;
  readonly me: MeApi;
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
    this.recordings = new Recordings(t);
    this.jobs = new Jobs(t);
    this.corrections = new Corrections(t);
    this.shareLinks = new ShareLinks(t);
    this.voices = new Voices(t);
    this.search = new Search(t);
    this.me = new MeApi(t);
    this.billing = new Billing(t);
    this.languages = new Languages(t);
    this.rtmp = new Rtmp(t);
    this.events = new Events(t);
    this.meta = new Meta(t);
  }
}
