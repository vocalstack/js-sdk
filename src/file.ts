
export type FileInput = string | Uint8Array | ArrayBuffer | Blob | AsyncIterable<Uint8Array>;

export async function* fileChunks(input: FileInput): AsyncIterable<Uint8Array> {
  if (typeof input === 'string') {
    const fsSpecifier = 'node:' + 'fs';
    const { createReadStream } = (await import(/* @vite-ignore */ fsSpecifier)) as typeof import('node:fs');
    for await (const chunk of createReadStream(input)) {
      yield chunk as Uint8Array;
    }
    return;
  }
  if (input instanceof Uint8Array) {
    yield input;
    return;
  }
  if (input instanceof ArrayBuffer) {
    yield new Uint8Array(input);
    return;
  }
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const reader = input.stream().getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value) yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
  if (input && typeof input === 'object' && Symbol.asyncIterator in input) {
    yield* input as AsyncIterable<Uint8Array>;
    return;
  }
  throw new TypeError('transcribeFile: expected a path, Blob, byte array, or async iterable');
}
