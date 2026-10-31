import type { RealtimeSession } from './realtime.js';

const WORKLET_SOURCE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    if (!ch || ch.length === 0) return true;
    this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

export type MicStallReason =
  | 'track_ended'
  | 'track_muted'
  | 'context_suspended'
  | 'context_closed'
  | 'silent';

export interface MicCaptureOptions {
  chunkSeconds?: number;
  sampleRate?: number;
  audio?: MediaTrackConstraints;
  onClock?: (pcm: number, wall: number) => void;
  onStall?: (reason: MicStallReason) => void;
  onRecover?: () => void;
  silentSeconds?: number;
}

export interface MicDevice {
  label: string;
  sampleRate?: number;
  channelCount?: number;
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
}

export interface MicCapture {
  stop(): Promise<void>;
  readonly sampleRate: number;
  readonly device: MicDevice;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
}

const RECOVER_MS = 1000;
const CLOCK_MS = 500;

export async function captureMicrophone(
  onChunk: (pcm: Float32Array) => void,
  opts: MicCaptureOptions = {},
): Promise<MicCapture> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    throw new Error('captureMicrophone is browser-only (no mediaDevices)');
  }
  const targetRate = opts.sampleRate ?? 16000;
  const chunkSamples = Math.round((opts.chunkSeconds ?? 0.25) * targetRate);
  const constraints: MediaTrackConstraints = opts.audio ?? {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
  };

  let muted = false;
  let media = await navigator.mediaDevices.getUserMedia({ audio: constraints });
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: targetRate });
  } catch {
    ctx = new AudioContext();
  }
  const workletUrl = URL.createObjectURL(
    new Blob([WORKLET_SOURCE], { type: 'application/javascript' }),
  );
  try {
    await ctx.audioWorklet.addModule(workletUrl);
  } finally {
    URL.revokeObjectURL(workletUrl);
  }
  const node = new AudioWorkletNode(ctx, 'pcm-processor');
  let source = ctx.createMediaStreamSource(media);
  source.connect(node);

  const inputRate = ctx.sampleRate;
  const passThrough = inputRate === targetRate;
  let buffered: number[] = [];
  let readPos = 0;
  let pending: Float32Array | null = null;
  const t0 = performance.now();
  let outSamples = 0;

  const silentLimit = Math.round((opts.silentSeconds ?? 3) * inputRate);
  let zeroRun = 0;
  let silentFlagged = false;

  let stopped = false;
  let stall: MicStallReason | null = null;
  let recoverTimer: ReturnType<typeof setTimeout> | null = null;
  const setStall = (reason: MicStallReason) => {
    if (stopped || stall === reason) return;
    stall = reason;
    opts.onStall?.(reason);
  };
  const clearStall = () => {
    if (stall === null) return;
    stall = null;
    opts.onRecover?.();
  };

  node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
    const block = ev.data;

    if (silentLimit > 0) {
      let allZero = true;
      for (const v of block) {
        if (v !== 0) {
          allZero = false;
          break;
        }
      }
      if (allZero) {
        zeroRun += block.length;
        if (!silentFlagged && zeroRun >= silentLimit) {
          silentFlagged = true;
          setStall('silent');
        }
      } else {
        zeroRun = 0;
        if (silentFlagged) {
          silentFlagged = false;
          if (stall === 'silent') clearStall();
        }
      }
    }

    let out: ArrayLike<number>;
    if (passThrough) {
      out = block;
    } else {
      for (const v of block) buffered.push(v);
      const step = inputRate / targetRate;
      const res: number[] = [];
      while (readPos + 1 < buffered.length) {
        const i = Math.floor(readPos);
        const frac = readPos - i;
        res.push(buffered[i] * (1 - frac) + buffered[i + 1] * frac);
        readPos += step;
      }
      const keepFrom = Math.max(0, Math.floor(readPos) - 1);
      buffered = buffered.slice(keepFrom);
      readPos -= keepFrom;
      out = res;
    }

    if (out.length) {
      outSamples += out.length;
      if (stall !== null && stall !== 'silent') clearStall();
      pending = pending ? concat(pending, out) : Float32Array.from(out);
      while (pending.length >= chunkSamples) {
        const chunk = pending.slice(0, chunkSamples);
        onChunk(muted ? new Float32Array(chunk.length) : chunk);
        pending = pending.slice(chunkSamples);
      }
    }
  };

  const clockTimer = opts.onClock
    ? setInterval(() => {
        opts.onClock?.(outSamples, (performance.now() - t0) / 1000);
      }, CLOCK_MS)
    : null;

  const scheduleRecover = (fn: () => void) => {
    if (stopped || recoverTimer) return;
    recoverTimer = setTimeout(() => {
      recoverTimer = null;
      fn();
    }, RECOVER_MS);
  };

  const resumeContext = () => {
    if (stopped || ctx.state !== 'suspended') return;
    void ctx.resume().catch(() => {}).then(() => {
      if (!stopped && ctx.state === 'suspended') scheduleRecover(resumeContext);
    });
  };

  const reacquireTrack = () => {
    if (stopped) return;
    navigator.mediaDevices
      .getUserMedia({ audio: constraints })
      .then((next) => {
        if (stopped) {
          for (const t of next.getTracks()) t.stop();
          return;
        }
        source.disconnect();
        for (const t of media.getTracks()) t.stop();
        media = next;
        source = ctx.createMediaStreamSource(media);
        source.connect(node);
        watchTracks(media);
      })
      .catch(() => scheduleRecover(reacquireTrack));
  };

  const watchTracks = (stream: MediaStream) => {
    for (const track of stream.getAudioTracks()) {
      track.addEventListener('ended', () => {
        if (stopped) return;
        setStall('track_ended');
        scheduleRecover(reacquireTrack);
      });
      track.addEventListener('mute', () => {
        if (!stopped) setStall('track_muted');
      });
    }
  };
  watchTracks(media);

  ctx.addEventListener('statechange', () => {
    if (stopped) return;
    if (ctx.state === 'suspended') {
      setStall('context_suspended');
      resumeContext();
    } else if (ctx.state === 'closed') {
      setStall('context_closed');
    }
  });

  return {
    sampleRate: targetRate,
    get device(): MicDevice {
      const t = media.getAudioTracks()[0];
      const st = (t?.getSettings?.() ?? {}) as MediaTrackSettings;
      return { label: t?.label ?? '', sampleRate: st.sampleRate, channelCount: st.channelCount, noiseSuppression: st.noiseSuppression, echoCancellation: st.echoCancellation };
    },
    get muted() {
      return muted;
    },
    setMuted(on: boolean) {
      muted = !!on;
    },
    async stop() {
      stopped = true;
      if (clockTimer) clearInterval(clockTimer);
      if (recoverTimer) clearTimeout(recoverTimer);
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      for (const t of media.getTracks()) t.stop();
      await ctx.close();
    },
  };
}

export async function streamMicrophone(
  session: RealtimeSession,
  opts: MicCaptureOptions = {},
): Promise<MicCapture> {
  return captureMicrophone((pcm) => session.sendAudio(pcm), {
    onClock: (pcm, wall) => session.sendClock(pcm, wall),
    ...opts,
  });
}

function concat(a: Float32Array, b: ArrayLike<number>): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
