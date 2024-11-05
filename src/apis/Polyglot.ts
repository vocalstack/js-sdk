import { z } from 'zod';

import { Language, Timeline, Uuid, zLanguage } from '../generics.zod';
import { ApiResponse } from '../RestApi';
import { VocalStackApi } from '../VocalStackApi';
import { WebsocketConnection } from '../WebsocketApi';

import { SummaryTranscriptions } from './Transcriptions';

export const zPolyglotSession = z.object({
  name: z.string(),
  link: z.string(),
  password: z.string().optional(),
  language: zLanguage.optional(),
  max_duration_s: z.number().optional(),
  timeout_period_s: z.number().optional(),
  livestream_url: z.string().optional(),
});

export type PolyglotSessionRequest = {
  id?: string;
  password?: string;
  name: string;
  link: string;
  language: Language | null;
  max_duration_s: number | null;
  timeout_period_s: number | null;
  livestream_url: string | null;
};

export type PolyglotSession = {
  id: string;
  name: string;
  link: string;
  fullUrl: string;
  is_public: boolean;
  requests: SummaryTranscriptions;
  language: Language | null;
  max_duration_s: number | null;
  timeout_period_s: number | null;
  livestream_url: string | null;
};

export type PolyglotCreatedSession = {
  id: string;
  link: string;
};

export type PolyglotUpdatedSession = {
  id: string;
  link: string;
};

export type PolyglotGetSessionResponse = ApiResponse<PolyglotSession>;

export type PolyglotGetAllSessionsResponse = ApiResponse<PolyglotSession[]>;

export type PolyglotDeleteSessionResponse = ApiResponse<null>;

export type PolyglotCreateSessionResponse = ApiResponse<PolyglotCreatedSession>;

export type PolyglotUpdateSessionResponse = ApiResponse<PolyglotUpdatedSession>;

export type PolyglotPresenterRequest = { link: string; password?: string };
export type PolyglotPresenterResponse = {
  status: string;
  data: {
    session: PolyglotPresenterSession;
    activeTranscription: PolyglotPresenterTranscription;
  };
  http_code?: number;
  error?: string;
};

export type PolyglotPresenterConnection = WebsocketConnection<PolyglotPresenterResponse>;

export type PolyglotPresenterSession = {
  id: Uuid;
  name: string;
  link: string;
  fullUrl: string;
  is_public: boolean;
  requests: PolyglotPresenterTranscription[];
};

export type PolyglotPresenterTranscription = {
  id: Uuid;
  polyglot_id: Uuid | null;
  start: string;
  end: string | null;
  status: 'waiting' | 'processing' | 'done' | 'error';
  operation: 'transcription-live';
  flags?: { started: boolean } | null;
  timeline?: Timeline;
  keywords?: string | null;
};

export class Polyglot extends VocalStackApi {
  async getSession({ id }: { id: string }): Promise<PolyglotGetSessionResponse> {
    return this._rest().get<PolyglotSession>(`/polyglot/${id}`);
  }

  async getAllSessions(): Promise<PolyglotGetAllSessionsResponse> {
    return this._rest().get<PolyglotSession[]>('/polyglot');
  }

  async deleteSession({ id }: { id: string }): Promise<PolyglotDeleteSessionResponse> {
    return this._rest().delete<null>(`/polyglot/${id}`);
  }

  async createSession(session: PolyglotSessionRequest): Promise<PolyglotCreateSessionResponse> {
    const validation = this.withValidation(zPolyglotSession, session);
    return (
      validation.badResponse ||
      this._rest().post<PolyglotCreatedSession>('/polyglot', {
        json: validation.data,
      })
    );
  }

  async updateSession(session: PolyglotSessionRequest): Promise<PolyglotUpdateSessionResponse> {
    const validation = this.withValidation(zPolyglotSession, session);
    return (
      validation.badResponse ||
      this._rest().put<PolyglotUpdatedSession>(`/polyglot/${session.id}`, {
        json: validation.data,
      })
    );
  }

  async getLiveSessionStream({ link, password }: PolyglotPresenterRequest): Promise<PolyglotPresenterConnection> {
    return this._ws().connect<PolyglotPresenterResponse>({
      path: `/async/polyglot/${link}`,
      headers: { password: !password ? '' : password },
    });
  }
}
