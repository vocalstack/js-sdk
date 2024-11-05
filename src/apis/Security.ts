import { z } from 'zod';
import { VocalStackApi } from '../VocalStackApi';
import { ApiResponse } from '../RestApi';

const zGenerateTokenRequest = z.object({
  access: z.union([z.literal('readonly'), z.literal('readwrite')]).optional(),
  lifetime_s: z.optional(z.number().gt(0).lte(120)),
  one_time: z.optional(z.boolean()),
});

type GenerateTokenRequest = z.infer<typeof zGenerateTokenRequest>;

export type GenerateTokenResponse = {
  status: 'done' | 'error';
  data: string;
};

export class Security extends VocalStackApi {
  async generateToken(request?: GenerateTokenRequest): Promise<ApiResponse<GenerateTokenResponse>> {
    if (typeof window !== 'undefined') {
      return Promise.resolve({
        success: false,
        error: 'Cannot generate token in a browser window. Please use a server environment.',
        status: 'error',
        data: null,
      });
    }
    return this._rest().get<GenerateTokenResponse>(`/security/generate-token?${this.buildQueryString(request || {})}`);
  }
}
