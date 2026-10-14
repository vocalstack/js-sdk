export interface WsLike {
  binaryType: string;
  readyState: number;
  send(data: string | ArrayBufferLike | Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: (ev: any) => void): void;
}

export const WS_OPEN = 1;

const isNode = () =>
  typeof (globalThis as any).process?.versions?.node === 'string' &&
  !(globalThis as any).Deno &&
  !(globalThis as any).Bun;

/** Open a socket.  `bearer` is the caller's credential: Node sends it as
 * an `Authorization` header (an API key is refused in a URL); a browser
 * cannot set socket headers, so it rides in `access_token` instead. */
export async function openWebSocket(url: string, bearer?: string): Promise<WsLike> {
  if (!isNode() && typeof (globalThis as any).WebSocket === 'function') {
    const u = bearer ? `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(bearer)}` : url;
    return new (globalThis as any).WebSocket(u) as WsLike;
  }
  const { WebSocket: NodeWebSocket } = await import('ws');
  return new NodeWebSocket(url, bearer ? { headers: { authorization: `Bearer ${bearer}` } } : undefined) as unknown as WsLike;
}
