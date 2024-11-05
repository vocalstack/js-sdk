import { z } from 'zod';

import { Timeline, Uuid, zDuration, zLanguage } from '../generics.zod';
import { VocalStackApi } from '../VocalStackApi';
import { WebsocketConnection } from '../WebsocketApi';
import { ApiResponse } from '../RestApi';

import { Status } from './Transcriptions';

const zUrlTranscriptionStartRequest = z.object({
  url: z.string(),
  duration_s: zDuration.optional(),
  max_duration_s: zDuration.optional(),
  language: zLanguage.optional(),
});

export type UrlTranscriptionStartRequest = z.infer<typeof zUrlTranscriptionStartRequest>;
export type UrlTranscriptionStreamData = ArrayBufferLike;
export type UrlTranscriptionResponse = {
  status: Status;
  data: UrlTranscriptionResponseData | null;
  http_code?: number;
};

export type UrlTranscriptionResponseData = {
  id: Uuid;
  status: Status;
  operation: 'transcription-prerecorded';
  start: string;
  end: string | null;
  flags?: { started: boolean } | null;
  keywords?: string | null;
  timeline?: Timeline;
  paragraphs?: string[] | null;
  summary?: string | null;
  progress: number;
};

export type UrlTranscriptionStopRequest = { id: string };

export type UrlTranscriptionConnection = WebsocketConnection<UrlTranscriptionResponse>;

export type UrlTranscriptionRestResponse = ApiResponse<{
  id: Uuid;
  status: 'processing' | 'error';
  http_code?: number;
}>;

export class UrlTranscription extends VocalStackApi {
  async connect(request: UrlTranscriptionStartRequest): Promise<UrlTranscriptionConnection> {
    const queryString = this.getQuery(request);
    return this._ws().connect<UrlTranscriptionResponse>({
      path: `/async/transcribe/url?${queryString}`,
      mustStart: true,
      headers: {},
    });
  }

  async transcribe(request: UrlTranscriptionStartRequest): Promise<UrlTranscriptionRestResponse> {
    const queryString = this.getQuery(request);
    return this._rest().post<null>(`/async/transcribe/url?${queryString}`);
  }

  private getQuery(request: UrlTranscriptionStartRequest) {
    const validation = this.withValidation(zUrlTranscriptionStartRequest, request);
    if (validation.badResponse) {
      throw new Error(validation.badResponse.error);
    }

    const queryString = this.buildQueryString({
      language: request.language || 'auto',
      url: encodeURIComponent(request.url),
      duration_s: request.duration_s,
      max_duration_s: request.max_duration_s,
    });

    return queryString;
  }
}
