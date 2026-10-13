import type { RealtimeSession } from './realtime.js';

// The worklet runs on the browser's realtime audio thread and does one
// allocation-light thing: post every 128-frame block to the main thread.
// MessagePort queues are unbounded and never overwrite, so a busy main
// thread (a big transcript re-render) delivers audio late, never drops it.
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

/** Why capture stopped producing audio (see `MicCaptureOptions.onStall`). */
export type MicStallReason =
  /** The input track ended: device unplugged, headset switched, permission revoked. */
  | 'track_ended'
  /** The track is muted by the OS/hardware (no samples until it unmutes). */
  | 'track_muted'
  /** The AudioContext was suspended (phone call, screen lock, route change). */
  | 'context_suspended'
  /** The AudioContext was closed underneath us. */
  | 'context_closed'
  /** Seconds of exact-zero samples: a silently denied or hardware-muted mic. */
  | 'silent';

export interface MicCaptureOptions {
  chunkSeconds?: number;
  sampleRate?: number;
  audio?: MediaTrackConstraints;
  /**
   * Called every ~0.5s with (pcm, wall): cumulative output samples
   * produced and seconds since capture start.  Wire it to
   * `session.sendClock` so the server can detect capture loss (a
   * suspended context or dead track produces no samples while wall
   * time advances) and mark the transcript with honest gaps.  Driven
   * by a timer, not by sample arrival, so it keeps reporting while
   * capture is stalled — that is the case it exists for.
   */
  onClock?: (pcm: number, wall: number) => void;
  /**
   * Capture stopped producing audio.  Recovery is attempted
   * automatically (context resume, track re-acquire); `onRecover`
   * fires when samples flow again.  Use it to show a "microphone
   * lost" state instead of "Listening".
   */
  onStall?: (reason: MicStallReason) => void;
  /** Audio is flowing again after a stall. */
  onRecover?: () => void;
  /**
   * Exact-zero run length (seconds) that flags a silently denied or
   * hardware-muted mic (real mics always carry a noise floor).  Default
   * 3; 0 disables.
   */
  silentSeconds?: number;
}

/** The input device the capture is reading, as the browser reports it. */
export interface MicDevice {
  /** The device's name, e.g. "MacBook Pro Microphone" ("" before permission is granted). */
  label: string;
  /** Its native rate (the capture resamples to `sampleRate`). */
  sampleRate?: number;
  channelCount?: number;
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
}

export interface MicCapture {
  stop(): Promise<void>;
  readonly sampleRate: number;
  /** The microphone being read now (a re-acquired track may be another one). */
  readonly device: MicDevice;
  /** Hold the capture open but stop sending what the microphone hears.
   *
   *  A side conversation should not have to end the session, and pausing
   *  is not the same thing: pausing closes the stream and the listeners
   *  lose it. Muting keeps every listener connected and the recording
   *  running, and simply says nothing.
   *
   *  Muted chunks are emitted as SILENCE rather than dropped. The server
   *  measures media time by the audio it receives, so dropping would
   *  compress the timeline and every later timestamp would be wrong;
   *  silence keeps the clock honest and transcribes to nothing, which is
   *  exactly what happened. */
  setMuted(muted: boolean): void;
  readonly muted: boolean;
}

/** Retry cadence for context resume / track re-acquire while stalled. */
const RECOVER_MS = 1000;
/** Capture clock heartbeat cadence. */
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
  // Ask for the target rate directly: Chrome/Firefox/Safari 14.1+ then
  // resample on the audio thread and our converter is a pass-through.
  // Browsers that refuse the option fall back to the default rate and the
  // linear-interpolation resampler below.
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
  // Capture clock: cumulative resampled output samples vs wall time.
  const t0 = performance.now();
  let outSamples = 0;

  // Zero-run detector state (input-rate samples).
  const silentLimit = Math.round((opts.silentSeconds ?? 3) * inputRate);
  let zeroRun = 0;
  let silentFlagged = false;

  // Stall bookkeeping: one active reason at a time; `onRecover` fires
  // once when it clears.
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
      // Samples flowing again clears a track/context stall; the silent
      // stall clears only on a nonzero sample (handled above).
      if (stall !== null && stall !== 'silent') clearStall();
      pending = pending ? concat(pending, out) : Float32Array.from(out);
      while (pending.length >= chunkSamples) {
        const chunk = pending.slice(0, chunkSamples);
        // Silence, not nothing: see `MicCapture.setMuted`.
        onChunk(muted ? new Float32Array(chunk.length) : chunk);
        pending = pending.slice(chunkSamples);
      }
    }
  };

  // Heartbeat on a timer so a stalled capture is still reported: pcm
  // stops while wall advances, and the server declares the gap.
  const clockTimer = opts.onClock
    ? setInterval(() => {
        opts.onClock?.(outSamples, (performance.now() - t0) / 1000);
      }, CLOCK_MS)
    : null;

  // --- recovery -------------------------------------------------------

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
        // `onRecover` fires from the first delivered block.
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
      // `unmute` needs no handler: the next block clears the stall.
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
