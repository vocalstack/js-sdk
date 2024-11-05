import { z } from 'zod';

import { Timeline, Uuid, zLanguage } from '../generics.zod';
import { VocalStackApi } from '../VocalStackApi';
import { DuplexWebsocketConnection } from '../WebsocketApi';

import { Status } from './Transcriptions';

const zLiveTranscriptionStartRequest = z.object({
  livestream_url: z.string().optional(),
  language: zLanguage.optional(),
  translations: zLanguage.array().optional(),
  polyglot_id: z.string().optional(),
  timeout_period_s: z.number().optional(),
  max_duration_s: z.number().optional(),
});

export type LiveTranscriptionStartRequest = z.infer<typeof zLiveTranscriptionStartRequest>;
export type LiveTranscriptionStreamData = ArrayBufferLike;
export type LiveTranscriptionResponse = {
  status: Status;
  data: LiveTranscriptionResponseData | null;
  http_code?: number;
};

export type LiveTranscriptionResponseData = {
  id: Uuid;
  polyglot_id: Uuid | null;
  start: string;
  end: string | null;
  status: Status;
  operation: 'transcription-live';
  flags?: { started: boolean } | null;
  keywords?: string | null;
  timeline?: Timeline;
  paragraphs?: string[] | null;
  summary?: string | null;
};

export type LiveTranscriptionStopRequest = { id: string };

export type LiveTranscriptionConnection = DuplexWebsocketConnection<
  LiveTranscriptionStreamData,
  LiveTranscriptionResponse
>;

export class LiveTranscription extends VocalStackApi {
  async connect(request: LiveTranscriptionStartRequest = {}): Promise<LiveTranscriptionConnection> {
    const validation = this.withValidation(zLiveTranscriptionStartRequest, request);
    if (validation.badResponse) {
      throw new Error(validation.badResponse.error);
    }

    const headers: Record<string, string> = {};
    if (request['livestream_url'] && request['livestream_url'] !== 'undefined') {
      headers['livestream-url'] = request.livestream_url;
    }

    const queryString = this.buildQueryString({
      polyglot_id: request.polyglot_id,
      language: request.language,
      translations: request.translations?.join(','),
      timeout_period_s: request.timeout_period_s,
      max_duration_s: request.max_duration_s,
    });

    return this._ws().connectDuplex<LiveTranscriptionStreamData, LiveTranscriptionResponse>({
      path: `/async/live/transcribe?${queryString}`,
      headers,
    });
  }

  async stopTranscribing({ id }: LiveTranscriptionStopRequest) {
    return this._rest().patch(`/live/transcribe/${id}/stop`);
  }
}
