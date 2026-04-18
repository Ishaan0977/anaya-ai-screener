'use client';
import { useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type MicState = 'idle' | 'recording' | 'playing' | 'done' | 'error';

function MicCheckContent() {
  const router = useRouter();
  const params = useSearchParams();
  const session = params.get('session') ?? '';
  const name = params.get('name') ?? '';

  const [micState, setMicState] = useState<MicState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function startRecording() {
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      setMicState('recording');
      setTimeout(() => stopRecording(), 4000); // auto-stop after 4s
    } catch {
      setErrorMsg('Microphone access denied. Please allow mic access and try again.');
      setMicState('error');
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setMicState('done');
      audio.play();
      setMicState('playing');
    };
    recorder.stop();
  }

  function proceed() {
    router.push(`/interview?session=${session}&name=${encodeURIComponent(name)}`);
  }

  const stateConfig = {
    idle: {
      icon: '🎙️',
      title: 'Test your microphone',
      subtitle: 'We\'ll record 4 seconds of audio and play it back so you can confirm everything sounds good.',
      action: startRecording,
      actionLabel: 'Start mic test',
      actionStyle: 'gold',
    },
    recording: {
      icon: '⏺',
      title: 'Recording...',
      subtitle: 'Say something — "Hello, my name is..." — we\'ll play it back in a moment.',
      action: stopRecording,
      actionLabel: 'Stop early',
      actionStyle: 'ghost',
    },
    playing: {
      icon: '🔊',
      title: 'Playing back...',
      subtitle: 'Can you hear yourself clearly? If not, check your speaker volume.',
      action: null,
      actionLabel: '',
      actionStyle: 'ghost',
    },
    done: {
      icon: '✅',
      title: 'Mic check complete',
      subtitle: 'Everything sounds good. You\'re ready to start.',
      action: proceed,
      actionLabel: 'Start interview →',
      actionStyle: 'gold',
    },
    error: {
      icon: '❌',
      title: 'Microphone not found',
      subtitle: errorMsg,
      action: startRecording,
      actionLabel: 'Try again',
      actionStyle: 'gold',
    },
  };

  const config = stateConfig[micState];

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1,
      display: 'flex', flexDirection: 'column' }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 60% 40% at 50% 30%, rgba(201,168,76,0.06) 0%, transparent 70%)',
      }} />

      <header style={{
        padding: '16px 32px', borderBottom: '1px solid var(--border)',
        background: 'rgba(10,10,15,0.8)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 2,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: 'linear-gradient(135deg, #c9a84c, #e8c96a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 12, color: '#0a0a0f',
        }}>C</div>
        <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.08em' }}>CUEMATH</span>
      </header>

      <main style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', position: 'relative', zIndex: 2,
      }}>
        <div className="glass fade-up" style={{
          borderRadius: 28, padding: '48px 40px',
          maxWidth: 440, width: '100%', textAlign: 'center',
        }}>
          {/* Animated icon */}
          <div style={{
            width: 80, height: 80, borderRadius: '50%', margin: '0 auto 24px',
            background: micState === 'recording'
              ? 'rgba(248,113,113,0.15)'
              : micState === 'done'
              ? 'rgba(74,222,128,0.15)'
              : 'rgba(201,168,76,0.1)',
            border: `1px solid ${micState === 'recording'
              ? 'rgba(248,113,113,0.3)'
              : micState === 'done'
              ? 'rgba(74,222,128,0.3)'
              : 'rgba(201,168,76,0.25)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32,
            animation: micState === 'recording' ? 'pulse-record 1.4s ease-in-out infinite' : 'none',
          }}>
            {config.icon}
          </div>

          <h2 style={{
            fontFamily: 'Cormorant Garamond', fontSize: 28,
            fontWeight: 700, color: 'var(--white)', marginBottom: 10,
          }}>
            {config.title}
          </h2>
          <p style={{
            fontSize: 14, color: 'var(--white-40)',
            lineHeight: 1.7, marginBottom: 32, maxWidth: 320, margin: '0 auto 32px',
          }}>
            {config.subtitle}
          </p>

          {/* Progress bar for recording */}
          {micState === 'recording' && (
            <div style={{
              width: '100%', height: 3, borderRadius: 4,
              background: 'var(--white-15)', overflow: 'hidden', marginBottom: 24,
            }}>
              <div style={{
                height: '100%', borderRadius: 4,
                background: '#f87171',
                animation: 'grow-bar 4s linear forwards',
              }} />
            </div>
          )}

          {config.action && (
            <button
              onClick={config.action}
              className={config.actionStyle === 'gold' ? 'btn-gold' : 'btn-ghost'}
              style={{ padding: '14px 36px', borderRadius: 14, fontSize: 14 }}>
              {config.actionLabel}
            </button>
          )}

          {micState === 'done' && (
            <button
              onClick={startRecording}
              className="btn-ghost"
              style={{ padding: '10px 24px', borderRadius: 12, fontSize: 13, marginTop: 12, marginLeft: 8 }}>
              Test again
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

export default function MicCheckPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--white-40)' }}>Loading...</p>
      </div>
    }>
      <MicCheckContent />
    </Suspense>
  );
}
