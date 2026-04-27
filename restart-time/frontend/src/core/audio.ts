import { apiUpload } from './api';

export function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return 'audio/webm';
}

export interface RecorderHandle {
  stop: () => Promise<Blob>;
  cancel: () => void;
  analyser: AnalyserNode;
  startedAt: number;
}

/**
 * Start recording. Returns a handle the UI uses to display the waveform/timer
 * and to either stop (returning the blob) or cancel (discarding it).
 */
export async function startRecording(): Promise<RecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMimeType();
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  });
  recorder.start();

  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  let cancelled = false;

  const cleanup = () => {
    stream.getTracks().forEach((t) => t.stop());
    audioCtx.close().catch(() => {});
  };

  return {
    startedAt: Date.now(),
    analyser,
    stop: () =>
      new Promise<Blob>((resolve) => {
        if (cancelled) {
          cleanup();
          resolve(new Blob([], { type: mime }));
          return;
        }
        recorder.addEventListener(
          'stop',
          () => {
            cleanup();
            resolve(new Blob(chunks, { type: mime }));
          },
          { once: true },
        );
        recorder.stop();
      }),
    cancel: () => {
      cancelled = true;
      try {
        recorder.stop();
      } catch {}
      cleanup();
    },
  };
}

export interface SttResult {
  text: string;
  detected_language: string | null;
  duration_ms: number | null;
  audio_path: string | null;
  audio_signed_url: string | null;
}

/** Upload a recorded audio blob to /audio/stt; returns transcription. */
export async function transcribe(
  blob: Blob,
  opts: { sessionId?: string; language?: string } = {},
): Promise<SttResult> {
  const fd = new FormData();
  fd.append('audio', blob, `voice-${Date.now()}.webm`);
  if (opts.sessionId) fd.append('session_id', opts.sessionId);
  if (opts.language) fd.append('language', opts.language);
  const r = await apiUpload<{ ok: boolean } & SttResult>('/audio/stt', fd);
  return r;
}

/** Play a Blob of audio. Returns a promise that resolves when finished. */
export function playAudioBlob(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener(
      'ended',
      () => {
        URL.revokeObjectURL(url);
        resolve();
      },
      { once: true },
    );
    audio.addEventListener(
      'error',
      () => {
        URL.revokeObjectURL(url);
        resolve();
      },
      { once: true },
    );
    audio.play().catch(() => resolve());
  });
}
