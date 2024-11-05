import { verifyApiVersion, EXPECTED_VOCALSTACK_API_VERSION } from './ApiVersion';

export type ApiResponse<T> = {
  status: 'waiting' | 'processing' | 'done' | 'error';
  data?: null | T;
  success: boolean;
  error?: string;
};

export type RequestOptions = RequestInit & {
  json?: Record<string, unknown>;
};

export class RestApi {
  private apiServer: string;
  private headers: Record<string, string>;

  constructor(apiServer: string, headers: Record<string, string>) {
    this.apiServer = apiServer;
    this.headers = headers;
  }

  async get<T>(path: string, options?: RequestOptions) {
    return this.apiCall<T>('GET', path, options);
  }

  async post<T>(path: string, options?: RequestOptions) {
    return this.apiCall<T>('POST', path, options);
  }

  async put<T>(path: string, options?: RequestOptions) {
    return this.apiCall<T>('PUT', path, options);
  }

  async patch<T>(path: string, options?: RequestOptions) {
    return this.apiCall<T>('PATCH', path, options);
  }

  async delete<T>(path: string, options?: RequestOptions) {
    return this.apiCall<T>('DELETE', path, options);
  }

  private async apiCall<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    options?: RequestOptions,
  ): Promise<ApiResponse<T>> {
    try {
      const fixedPath = path.startsWith('/') ? path.slice(1) : path;
      const { json, ...fetchOptions } = options || {};
      const body = json ? JSON.stringify(json) : undefined;
      const headers: Record<string, string> = {
        ...this.headers,
        'X-Expected-API-Version': EXPECTED_VOCALSTACK_API_VERSION,
      };

      if (body) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(`${this.apiServer}/${fixedPath}`, {
        method,
        headers,
        body,
        ...fetchOptions,
      });

      verifyApiVersion(
        response.headers.get('X-API-Version'),
        response.headers.get('X-API-Version-Discontinued') === '1',
      );

      return this.respond<T>(response);
    } catch (e) {
      console.log(e);
      return {
        success: false,
        error: String(e),
        status: 'error',
        data: undefined,
      };
    }
  }

  private async respond<T>(response: Response): Promise<ApiResponse<T>> {
    const success = response.ok;
    const json = success ? await response.json() : undefined;
    const data = {
      success,
      error: !success ? response.statusText : undefined,
      ...json,
    };

    if (data?.status === 'error') {
      data.error = 'An error occurred while processing the request.';
      data.success = false;
    }
    return data;
  }
}
