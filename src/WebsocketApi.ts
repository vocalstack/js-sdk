export interface WebsocketRequestOptions {
  path: string;
  mustStart?: boolean;
  headers?: Record<string, string>;
}

export type WebsocketConnection<ResponseType> = {
  start: () => void;
  close: () => void;
  onClose: (callback: () => void) => void;
  onData: (callback: (ev: ResponseType) => void) => void;
};

export type DuplexWebsocketConnection<RequestType, ResponseType> = WebsocketConnection<ResponseType> & {
  stop: () => void;
  sendBuffer: (message: RequestType) => void;
};
export class WebSocketsApi {
  private socket: WebSocket | undefined = undefined;
  private WebSocketClass: typeof WebSocket | undefined = undefined;
  private started: boolean = false;
  private session: string | undefined;

  constructor(
    private apiServer: string,
    private headers: Record<string, string>,
  ) {
    if (typeof window !== 'undefined') {
      // Browser environment: use native WebSocket
      this.WebSocketClass = window.WebSocket;
    } else if (typeof globalThis.WebSocket !== 'undefined') {
      // Node.js environment: use global WebSocket if available (e.g., Node 22+)
      this.WebSocketClass = globalThis.WebSocket;
    } else {
      // Node.js environment: use "ws" package where WebSocket is not available
      this.WebSocketClass = require('ws').WebSocket;
    }
  }

  private async makeSocketConnection(options: WebsocketRequestOptions): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const base = this.apiServer.replace('https://', 'wss://').replace('http://', 'ws://');
      const url = `${base}${options.path}`;
      const headers = { ...this.headers, ...options.headers, path: options.path };

      if (!this.WebSocketClass) {
        throw Error('WebSocket class was not loaded.');
      }

      const socket = new this.WebSocketClass(url);
      this.socket = socket;

      if (!this.socket) {
        throw Error('Failed to create WebSocket connection');
      }

      socket.onopen = () => {
        socket.send(JSON.stringify({ headers, session: this.session }));
        if (!options.mustStart) {
          resolve();
          return;
        }

        socket.addEventListener('message', (event) => {
          const data = JSON.parse(event.data.toString());
          if (data?.session) {
            resolve();
          }
        });
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        reject('A websocket error occurred connecting to the VocalStack API');
      };

      socket.addEventListener('message', (event) => {
        const data = JSON.parse(event.data.toString());
        if (data?.session) {
          this.session = data.session;
        }
        if (data?.status === 'done') {
          this.socket?.close();
        }
      });
    });
  }

  public async connect<ResponseType>(options: WebsocketRequestOptions) {
    await this.makeSocketConnection(options);
    return this.returnConnection<ResponseType>();
  }

  public async connectDuplex<RequestType, ResponseType>(options: WebsocketRequestOptions) {
    await this.makeSocketConnection({ ...options, mustStart: true });
    return this.returnDuplexConnection<RequestType, ResponseType>();
  }

  private returnConnection<ResponseType>() {
    return {
      start: () => {
        if (!this.socket) {
          console.error('Socket not connected');
          return;
        }
        if (this.started) {
          console.error('Already started');
          return;
        }
        this.started = true;
        this.socket.send(JSON.stringify({ start: true, session: this.session }));
      },

      close: () => this.close(),
      onClose: (callback: () => void) => this.onClose(callback),
      onData: (callback: (ev: ResponseType) => void) => this.onMessage<ResponseType>(callback),
    };
  }

  private returnDuplexConnection<RequestType, ResponseType>(): DuplexWebsocketConnection<RequestType, ResponseType> {
    return {
      ...this.returnConnection(),
      stop: () =>
        !this.socket
          ? console.error('Socket not connected')
          : this.socket.send(JSON.stringify({ stop: true, session: this.session })),
      sendBuffer: (message: RequestType) => this.sendBuffer<RequestType>(message),
    };
  }

  private async sendBuffer<T>(buffer: T): Promise<void> {
    if (!this.socket || this.socket.readyState !== this.WebSocketClass?.OPEN) {
      throw Error('WebSocket is not connected.');
    }
    if (!(buffer instanceof ArrayBuffer) && !ArrayBuffer.isView(buffer)) {
      throw Error('Unexpected data type being sent. Expected: ArrayBuffer or ArrayBufferView');
    } else {
      this.socket.send(buffer);
    }
  }

  private onMessage<T>(callback: (ev: T) => void): void {
    if (!this.socket) {
      throw Error('WebSocket is not connected.');
    }
    this.socket.addEventListener('message', (event) => {
      const data = JSON.parse(event.data.toString());
      callback(data as T);
    });
  }

  private onClose(callback: () => void): void {
    if (!this.socket) {
      throw Error('WebSocket is not connected.');
    }
    this.socket.addEventListener('close', callback);
  }

  private close(): void {
    if (!this.socket) {
      console.error('WebSocket is not connected.');
      return;
    }
    this.socket.close();
  }
}
