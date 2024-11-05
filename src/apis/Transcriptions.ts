import { Language, Timeline, Uuid } from '../generics.zod';
import { VocalStackApi } from '../VocalStackApi';
import { ApiResponse } from '../RestApi';
import { WebsocketConnection } from '../WebsocketApi';

export type { Timeline };

export type Operation = 'transcription-prerecorded' | 'transcription-live';

export type Status = 'waiting' | 'processing' | 'done' | 'stopping' | 'error';

export type FinishedTranscription = {
  id: Uuid;
  status: Status;
  operation: Operation;
  start: string;
  end?: string;
  keywords?: string | null;
  timeline: Timeline;
  paragraphs?: string[] | null;
  summary?: string | null;
  url?: string;
  duration: number;
};

export type SummaryTranscription = {
  id: string;
  operation: Operation;
  status: Status;
  duration?: number;
  start: string;
  end: string | null;
  polyglot_id: string;
  url?: string;
  keywords: string | null;
};

export type SummaryTranscriptions = SummaryTranscription[];

export type FinishedTranscriptionRequest = { id: string };
export type FinishedTranscriptionResponse = ApiResponse<FinishedTranscription>;

export type AllTranscriptionsResponse = ApiResponse<SummaryTranscriptions>;

export type AddTranscriptionTranslationRequest = { id: string; language: Language };
export type AddTranslationResponse = ApiResponse<{ timeline: Timeline }>;

export type RemoveTranscriptionTranslationRequest = { id: string; language: Language };
export type RemoveTranslationResponse = ApiResponse<null>;

export type AddTranscriptionTranslationAsyncResponse = { status: Status; data: FinishedTranscription | null };
export type AddTranscriptionTranslationConnection = WebsocketConnection<AddTranscriptionTranslationAsyncResponse>;

export class Transcriptions extends VocalStackApi {
  async getTranscription({ id }: FinishedTranscriptionRequest): Promise<FinishedTranscriptionResponse> {
    return this._rest().get<FinishedTranscription>(`/transcriptions/${id}`);
  }

  async getAllTranscriptions(): Promise<AllTranscriptionsResponse> {
    return this._rest().get<SummaryTranscriptions>('/transcriptions');
  }

  async addTranslation({ id, language }: AddTranscriptionTranslationRequest): Promise<AddTranslationResponse> {
    return this._rest().post<{ timeline: Timeline }>(`/transcription/${id}/language/${language}`);
  }

  async removeTranslation(req: RemoveTranscriptionTranslationRequest): Promise<RemoveTranslationResponse> {
    return this._rest().delete<null>(`/transcription/${req.id}/language/${req.language}`);
  }

  async addTranslationAsync(req: AddTranscriptionTranslationRequest): Promise<AddTranscriptionTranslationConnection> {
    return this._ws().connect<AddTranscriptionTranslationAsyncResponse>({
      path: `/async/transcription/${req.id}/language/${req.language}`,
    });
  }
}
