import { z } from 'zod';

import { ApiResponse, RestApi } from './RestApi';
import { WebSocketsApi } from './WebsocketApi';
import { Configuration, zConfiguration } from './generics.zod';
import { Status } from './apis/Transcriptions';

export const VOCALSTACK_API_SERVER = 'https://api.vocalstack.com';

export class VocalStackApi {
  protected headers: Record<string, string>;
  protected apiServer: string;

  constructor(config: Configuration) {
    const { apiServer, headers } = this.buildConfiguration(config);
    this.apiServer = apiServer;
    this.headers = headers;
  }

  protected _rest() {
    return new RestApi(this.apiServer, this.headers);
  }

  protected _ws() {
    return new WebSocketsApi(this.apiServer, this.headers);
  }

  private buildConfiguration(config: Configuration) {
    const parsedConfiguration = zConfiguration.safeParse(config);
    if (!parsedConfiguration.success) {
      throw new Error(parsedConfiguration.error.errors.map((err) => err.message).join(', '));
    }
    const data = parsedConfiguration.data;
    return {
      ...data,
      apiServer: data.apiServer || VOCALSTACK_API_SERVER,
      headers: {
        ...data.headers,
        authorization: data.authToken ? `Bearer ${data.authToken}` : data.apiKey || '',
      },
    };
  }

  protected withValidation(zodType: z.ZodType, data: unknown) {
    const parsedRequest = zodType.safeParse(data);
    return {
      success: parsedRequest.success,
      badResponse: parsedRequest.success
        ? undefined
        : ({
            status: 'error' as Status,
            data: null,
            success: false,
            error: parsedRequest.error.errors.map((err) => err.message).join(', '),
          } as ApiResponse<null>),
      data: parsedRequest.success ? parsedRequest.data : null,
    };
  }

  protected buildQueryString(params: Record<string, undefined | string | number | boolean>) {
    return Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}=${encodeURIComponent(value as string)}`)
      .join('&');
  }
}
