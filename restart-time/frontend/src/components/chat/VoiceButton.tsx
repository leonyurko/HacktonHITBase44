import { useEffect, useRef, useState } from 'react';
import { startRecording, type RecorderHandle } from '../../core/audio';
import Icon from '../ui/Icon';

const MIN_DURATION_MS = 500;

interface Props {
  onResult: (blob: Blob) => void;
  disabled?: boolean;
}

export default function VoiceButton({ onResult, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const handleRef = useRef<RecorderHandle | null>(null);
  const tickRef = useRef<number | null>(null);

  function tick() {
    const handle = handleRef.current;
    if (!handle) return;
    setElapsed(Math.floor((Date.now() - handle.startedAt) / 1000));
    const buf = new Uint8Array(handle.analyser.fftSize);
    handle.analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += Math.abs(v - 128);
    setLevel(Math.min(1, (sum / buf.length) / 60));
    tickRef.current = requestAnimationFrame(tick);
  }

  async function begin() {
    if (disabled) return;
    try {
      handleRef.current = await startRecording();
      setRecording(true);
      tickRef.current = requestAnimationFrame(tick);
    } catch (err) {
      console.error('mic_failed', err);
    }
  }

  async function finish() {
    if (!handleRef.current) return;
    if (tickRef.current) cancelAnimationFrame(tickRef.current);
    const handle = handleRef.current;
    handleRef.current = null;
    setRecording(false);
    const blob = await handle.stop();
    setElapsed(0);
    setLevel(0);
    if (blob.size === 0 || Date.now() - handle.startedAt < MIN_DURATION_MS) {
      return;
    }
    onResult(blob);
  }

  function cancel() {
    if (!handleRef.current) return;
    if (tickRef.current) cancelAnimationFrame(tickRef.current);
    handleRef.current.cancel();
    handleRef.current = null;
    setRecording(false);
    setElapsed(0);
    setLevel(0);
  }

  // Spacebar push-to-talk (when no input is focused).
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      void begin();
    }
    function up(e: KeyboardEvent) {
      if (e.code !== 'Space') return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      void finish();
    }
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      {recording && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            color: 'var(--text-muted)',
            fontSize: 14,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: 'var(--accent-good)',
              opacity: 0.4 + level * 0.6,
            }}
          />
          <span>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
          </span>
          <button
            type="button"
            onClick={cancel}
            style={{ minHeight: 'auto', padding: 'var(--space-1) var(--space-2)', fontSize: 14 }}
          >
            ×
          </button>
        </div>
      )}
      <button
        type="button"
        onMouseDown={begin}
        onMouseUp={finish}
        onTouchStart={(e) => {
          e.preventDefault();
          void begin();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          void finish();
        }}
        disabled={disabled}
        aria-label="hold to talk"
        style={{
          width: 48,
          height: 48,
          minHeight: 48,
          padding: 0,
          borderRadius: '50%',
          backgroundColor: recording ? 'var(--accent-good)' : 'var(--primary)',
          color: 'var(--on-primary)',
          border: 'none',
          boxShadow: recording
            ? '0 0 0 6px rgba(122,155,122,0.25)'
            : '0 2px 6px rgba(0,0,0,0.12)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name="mic" size={22} filled color="white" />
      </button>
    </div>
  );
}
