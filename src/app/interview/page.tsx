'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useIntegrityMonitor } from '@/hooks/useIntegrityMonitor';

type TranscriptEntry = { role: 'anaya' | 'candidate'; text: string; timestamp: number };
type InterviewState = 'loading' | 'anaya_speaking' | 'waiting' | 'listening' | 'processing' | 'complete';

// ── Breathing Orb Visualizer ──────────────────────────────────
function BreathingOrb({ analyserNode, state, isListening }: {
  analyserNode: AnalyserNode | null;
  state: InterviewState;
  isListening: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    cancelAnimationFrame(animRef.current);

    const W = canvas.width;
    const H = canvas.height;
    const cx = W / 2;
    const cy = H / 2;
    const baseRadius = Math.min(W, H) * 0.28;

    const dataArray = analyserNode ? new Uint8Array(analyserNode.frequencyBinCount) : null;

    function draw() {
      animRef.current = requestAnimationFrame(draw);
      timeRef.current += 0.016;
      const t = timeRef.current;

      ctx!.clearRect(0, 0, W, H);

      // Get audio data
      let avgFreq = 0;
      let bassFreq = 0;
      if (dataArray && analyserNode) {
        analyserNode.getByteFrequencyData(dataArray);
        avgFreq = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;
        bassFreq = (dataArray[2] + dataArray[3] + dataArray[4]) / (3 * 255);
      }

      // Determine orb behavior based on state
      let breathe = 0;
      let distortAmount = 0;
      let primaryColor: [number, number, number];
      let glowColor: string;

      if (isListening) {
        // Candidate speaking — warm green
        breathe = 0.06 + avgFreq * 0.15;
        distortAmount = avgFreq * 12;
        primaryColor = [74, 222, 128];
        glowColor = 'rgba(74, 222, 128, 0.35)';
      } else if (state === 'anaya_speaking') {
        // Anaya speaking — gold
        breathe = 0.08 + bassFreq * 0.2;
        distortAmount = avgFreq * 18;
        primaryColor = [201, 168, 76];
        glowColor = 'rgba(201, 168, 76, 0.4)';
      } else if (state === 'processing') {
        // Thinking — rapid violet pulse
        breathe = 0.05 + Math.sin(t * 6) * 0.04;
        distortAmount = 4;
        primaryColor = [139, 92, 246];
        glowColor = 'rgba(139, 92, 246, 0.35)';
      } else {
        // Idle — slow breath
        breathe = Math.sin(t * 0.8) * 0.06;
        distortAmount = 2;
        primaryColor = [100, 120, 160];
        glowColor = 'rgba(100, 120, 180, 0.2)';
      }

      const r = baseRadius * (1 + breathe);

      // Outer glow layers
      for (let g = 4; g >= 1; g--) {
        const glowR = r * (1 + g * 0.22);
        const alpha = (0.06 - g * 0.012) * (1 + bassFreq * 2);
        const grad = ctx!.createRadialGradient(cx, cy, 0, cx, cy, glowR);
        grad.addColorStop(0, `rgba(${primaryColor[0]},${primaryColor[1]},${primaryColor[2]},${alpha})`);
        grad.addColorStop(1, 'transparent');
        ctx!.beginPath();
        ctx!.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx!.fillStyle = grad;
        ctx!.fill();
      }

      // Draw morphing orb using bezier curves
      const points = 8;
      const angleStep = (Math.PI * 2) / points;
      ctx!.beginPath();
      for (let i = 0; i <= points; i++) {
        const angle = i * angleStep;
        const freqIndex = dataArray ? Math.floor((i / points) * dataArray.length * 0.5) : 0;
        const freqValue = dataArray ? dataArray[freqIndex] / 255 : 0;
        const noise =
          Math.sin(angle * 3 + t * 2.1) * distortAmount * 0.4 +
          Math.sin(angle * 5 - t * 1.7) * distortAmount * 0.3 +
          freqValue * distortAmount;
        const pr = r + noise;
        const px = cx + Math.cos(angle) * pr;
        const py = cy + Math.sin(angle) * pr;
        if (i === 0) ctx!.moveTo(px, py);
        else ctx!.lineTo(px, py);
      }
      ctx!.closePath();

      // Fill gradient
      const fillGrad = ctx!.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r * 1.2);
      fillGrad.addColorStop(0, `rgba(${primaryColor[0]},${primaryColor[1]},${primaryColor[2]},0.95)`);
      fillGrad.addColorStop(0.5, `rgba(${primaryColor[0]},${primaryColor[1]},${primaryColor[2]},0.75)`);
      fillGrad.addColorStop(1, `rgba(${Math.max(0, primaryColor[0]-40)},${Math.max(0, primaryColor[1]-40)},${Math.max(0, primaryColor[2]-40)},0.6)`);
      ctx!.fillStyle = fillGrad;
      ctx!.fill();

      // Specular highlight
      const hiGrad = ctx!.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx - r * 0.1, cy - r * 0.15, r * 0.55);
      hiGrad.addColorStop(0, 'rgba(255,255,255,0.45)');
      hiGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx!.fillStyle = hiGrad;
      ctx!.fill();
    }

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [analyserNode, state, isListening]);

  return (
    <canvas
      ref={canvasRef}
      width={220}
      height={220}
      style={{ width: 220, height: 220 }}
    />
  );
}

// ── Cinematic Word-by-Word Subtitle ──────────────────────────
function CinematicText({ entries }: { entries: TranscriptEntry[] }) {
  const anayaEntries = entries.filter(e => e.role === 'anaya');
  const latest = anayaEntries[anayaEntries.length - 1];
  const previous = anayaEntries[anayaEntries.length - 2];

  return (
    <div style={{ minHeight: 100, display: 'flex', flexDirection: 'column', gap: 12, padding: '0 8px' }}>
      {/* Previous line — dimmed */}
      {previous && (
        <p style={{
          fontSize: 13, lineHeight: 1.6, color: 'rgba(255,255,255,0.25)',
          transform: 'scale(0.97)', transformOrigin: 'left',
          transition: 'all 0.5s ease', fontStyle: 'italic',
        }}>
          {previous.text}
        </p>
      )}
      {/* Current line — cinematic fade-in words */}
      {latest && (
        <AnimatedWords key={latest.timestamp} text={latest.text} />
      )}
      {!latest && (
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
          Anaya&apos;s questions will appear here...
        </p>
      )}
    </div>
  );
}

function AnimatedWords({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <p style={{ fontSize: 15, lineHeight: 1.7, color: 'rgba(255,255,255,0.92)', margin: 0 }}>
      {words.map((word, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            opacity: 0,
            filter: 'blur(4px)',
            animation: `wordReveal 0.35s ease forwards`,
            animationDelay: `${i * 0.06}s`,
            marginRight: '0.28em',
          }}
        >
          {word}
        </span>
      ))}
    </p>
  );
}

// ── Thinking State Rotator ────────────────────────────────────
function ThinkingState() {
  const messages = [
    'Listening to your response...',
    'Analyzing candidate approach...',
    'Formulating follow-up...',
    'Synthesizing response...',
    'Crafting next question...',
  ];
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % messages.length);
        setVisible(true);
      }, 300);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: '50%',
            background: 'rgba(139,92,246,0.9)',
            animation: `dotPulse 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }} />
        ))}
      </div>
      <span style={{
        fontSize: 12, color: 'rgba(139,92,246,0.9)',
        fontStyle: 'italic', letterSpacing: '0.02em',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}>
        {messages[idx]}
      </span>
    </div>
  );
}

// ── Question Timeline ─────────────────────────────────────────
function QuestionTimeline({ current, total }: { current: number; total: number }) {
  const labels = ['Intro', 'Background', 'Scenario', 'Simplify', 'Emotional'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '8px 0' }}>
      {Array.from({ length: total + 1 }).map((_, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {/* Node + line */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                flexShrink: 0,
                background: done
                  ? 'linear-gradient(135deg, #c9a84c, #e8c96a)'
                  : active
                  ? 'rgba(201,168,76,0.2)'
                  : 'rgba(255,255,255,0.08)',
                border: active
                  ? '2px solid var(--gold, #c9a84c)'
                  : done
                  ? 'none'
                  : '2px solid rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, color: '#0a0a0f',
                boxShadow: done ? '0 0 8px rgba(201,168,76,0.5)' : active ? '0 0 12px rgba(201,168,76,0.3)' : 'none',
                transition: 'all 0.4s cubic-bezier(0.16,1,0.3,1)',
                animation: active ? 'nodeGlow 2s ease-in-out infinite' : 'none',
              }}>
                {done && '✓'}
              </div>
              {/* Connecting line */}
              {i < total && (
                <div style={{
                  width: 2, height: 28,
                  background: done
                    ? 'linear-gradient(to bottom, #c9a84c, rgba(201,168,76,0.3))'
                    : 'rgba(255,255,255,0.08)',
                  transition: 'background 0.6s ease',
                  marginTop: 2,
                }} />
              )}
            </div>
            {/* Label */}
            <div style={{ paddingTop: 1, paddingBottom: i < total ? 28 : 0 }}>
              <span style={{
                fontSize: 11, fontWeight: active ? 600 : 400,
                color: done ? 'rgba(201,168,76,0.8)' : active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)',
                transition: 'all 0.4s ease',
                letterSpacing: active ? '0.02em' : 0,
              }}>
                {labels[i] ?? `Q${i}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Interview Page ───────────────────────────────────────
function InterviewContent() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get('session') ?? '';
  const candidateName = params.get('name') ?? '';
  const firstName = candidateName.split(' ')[0];

  const [state, setState] = useState<InterviewState>('loading');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [followUpCount, setFollowUpCount] = useState(0);
  const [followUpUsedFor, setFollowUpUsedFor] = useState<number | null>(null);
  const [timeoutMsg, setTimeoutMsg] = useState('');
  const [tabWarning, setTabWarning] = useState(false);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTurnRef = useRef<{
    transcript: TranscriptEntry[];
    turn: number;
    followUpCount: number;
    followUpUsedFor: number | null;
  } | null>(null);
  const prevIsPlaying = useRef(false);

  const PROMPT_TIMEOUT = 45000;
  const SKIP_TIMEOUT = 90000;

  const { stopListening, startListening, isListening } = useSpeechRecognition();
  const { isPlaying, isFetching, playText, analyserNode } = useAudioPlayer();
  const { signals, recordResponseStart } = useIntegrityMonitor(state === 'waiting');

  const playOpeningAudio = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const audio = new Audio('/anaya-opening.mp3');
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch(() => resolve());
    });
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  useEffect(() => {
    if (!sessionId || state === 'loading') return;
    localStorage.setItem('anaya_session', JSON.stringify({
      sessionId, candidateName, turnIndex,
      followUpCount, followUpUsedFor, savedAt: Date.now(),
    }));
  }, [sessionId, candidateName, turnIndex, followUpCount, followUpUsedFor, state]);

  useEffect(() => {
    if (state === 'complete') localStorage.removeItem('anaya_session');
  }, [state]);

  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && (state === 'waiting' || state === 'listening')) {
        setTabWarning(true);
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        warningTimerRef.current = setTimeout(() => setTabWarning(false), 6000);
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [state]);

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  function clearTimeouts() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }

  const saveTranscriptTurn = useCallback(async (role: 'anaya' | 'candidate', text: string, index: number) => {
    await fetch('/api/session', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, action: 'add_turn', role, text, turn_index: index, timestamp_ms: Date.now() }),
    });
  }, [sessionId]);

  const triggerAssessment = useCallback(async () => {
    setState('complete');
    clearTimeouts();
    try {
      await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, integrity_signals: signals }),
      });
    } catch { }
    router.push(`/report/${sessionId}`);
  }, [sessionId, router, signals]);

  const autoStartMic = useCallback(async () => {
    recordResponseStart();
    setState('listening');
    startListening();
  }, [startListening, recordResponseStart]);

  const sendToAnaya = useCallback(async (
    currentTranscript: TranscriptEntry[],
    currentTurn: number,
    currentFollowUpCount: number,
    currentFollowUpUsedFor: number | null
  ) => {
    setState('processing');
    clearTimeouts();
    setTimeoutMsg('');

    try {
      if (currentTurn === 0) {
        const openingText = `Hi there! I'm Anaya from Cuemath's talent team — thanks for making time today. This will be a relaxed ten-minute conversation to get to know you better. No trick questions — just be yourself. Shall we begin?`;
        setTranscript([{ role: 'anaya', text: openingText, timestamp: Date.now() }]);
        setTurnIndex(1);
        setState('anaya_speaking');
        await playOpeningAudio();
        setState('waiting');
        await autoStartMic();
        return;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId, candidate_name: candidateName,
          transcript: currentTranscript, turn_index: currentTurn,
          follow_up_count: currentFollowUpCount, follow_up_used_for: currentFollowUpUsedFor,
          stream: true,
        }),
      });

      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? 'API error'); }
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let anayaText = '';
      let metadata: Record<string, unknown> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const parsed = JSON.parse(line.slice(6).trim());
              if (parsed.chunk) anayaText += parsed.chunk;
              if (parsed.done) { metadata = parsed; if (parsed.text) anayaText = parsed.text; }
              if (parsed.error) throw new Error(parsed.error);
            } catch (e) { if (!(e instanceof SyntaxError)) throw e; }
          }
        }
      }

      if (!anayaText.trim()) throw new Error('Empty response');
      anayaText = anayaText.trim();

      if (typeof metadata.question_number === 'number') setQuestionNumber(metadata.question_number as number);
      if (typeof metadata.follow_up_count === 'number') setFollowUpCount(metadata.follow_up_count as number);
      if (metadata.follow_up_used_for !== undefined) setFollowUpUsedFor((metadata.follow_up_used_for as number | null) ?? null);

      setTranscript(prev => [...prev, { role: 'anaya', text: anayaText, timestamp: Date.now() }]);
      setTurnIndex((metadata.next_turn as number) ?? currentTurn + 1);
      setState('anaya_speaking');

      if (metadata.interview_complete) {
        await playText(anayaText);
        await triggerAssessment();
      } else {
        pendingTurnRef.current = { transcript: currentTranscript, turn: currentTurn, followUpCount: currentFollowUpCount, followUpUsedFor: currentFollowUpUsedFor };
        await playText(anayaText);
      }
    } catch (err) {
      console.error('sendToAnaya error:', err);
      setState('waiting');
    }
  }, [sessionId, candidateName, playText, triggerAssessment, autoStartMic, playOpeningAudio]);

  function startTimeoutWatcher(ct: TranscriptEntry[], turn: number, fc: number, fu: number | null) {
    clearTimeouts();
    setTimeoutMsg('');
    timeoutRef.current = setTimeout(() => {
      setTimeoutMsg("Take your time — respond whenever you're ready.");
      timeoutRef.current = setTimeout(async () => {
        setTimeoutMsg('');
        await stopListening();
        const entry: TranscriptEntry = { role: 'candidate', text: '[No response]', timestamp: Date.now() };
        const nt = [...ct, entry];
        setTranscript(nt);
        await saveTranscriptTurn('candidate', entry.text, turn);
        await sendToAnaya(nt, turn + 1, fc, fu);
      }, SKIP_TIMEOUT - PROMPT_TIMEOUT);
    }, PROMPT_TIMEOUT);
  }

  useEffect(() => {
    if (prevIsPlaying.current && !isPlaying) {
      if (state === 'anaya_speaking' && pendingTurnRef.current) {
        const { transcript: t, turn, followUpCount: fc, followUpUsedFor: fu } = pendingTurnRef.current;
        pendingTurnRef.current = null;
        autoStartMic();
        startTimeoutWatcher(t, turn, fc, fu);
      }
    }
    prevIsPlaying.current = isPlaying;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, state, autoStartMic]);

  useEffect(() => {
    if (!sessionId || hasStarted.current) return;
    hasStarted.current = true;
    sendToAnaya([], 0, 0, null);
  }, [sessionId, sendToAnaya]);

  async function handleStopRecording() {
    if (state !== 'listening') return;
    clearTimeouts();
    setTimeoutMsg('');
    setState('processing');
    const spoken = await stopListening();
    if (!spoken || spoken.trim().length < 2) { await autoStartMic(); return; }
    const entry: TranscriptEntry = { role: 'candidate', text: spoken, timestamp: Date.now() };
    const nt = [...transcript, entry];
    setTranscript(nt);
    await saveTranscriptTurn('candidate', spoken, turnIndex);
    await sendToAnaya(nt, turnIndex + 1, followUpCount, followUpUsedFor);
  }

  const isAnayaActive = isPlaying || isFetching;

  // Determine orb label
  const orbLabel = isListening
    ? 'Listening to you...'
    : state === 'anaya_speaking'
    ? 'Anaya is speaking...'
    : state === 'processing'
    ? ''
    : state === 'complete'
    ? 'Interview complete'
    : state === 'loading'
    ? 'Connecting...'
    : 'Ready when you are';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        @keyframes wordReveal {
          from { opacity: 0; filter: blur(4px); transform: translateY(3px); }
          to   { opacity: 1; filter: blur(0);   transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1.1); opacity: 1; }
        }
        @keyframes nodeGlow {
          0%, 100% { box-shadow: 0 0 8px rgba(201,168,76,0.4); }
          50%       { box-shadow: 0 0 20px rgba(201,168,76,0.8), 0 0 40px rgba(201,168,76,0.3); }
        }
        @keyframes tabWarningSlide {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes completePop {
          0%   { transform: scale(0.8); opacity: 0; }
          60%  { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes breatheIdle {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.04); }
        }
        @keyframes micActivate {
          0%   { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(74,222,128,0.6); }
          50%  { box-shadow: 0 0 0 20px rgba(74,222,128,0); }
          100% { transform: scale(1);   box-shadow: 0 0 0 0 rgba(74,222,128,0); }
        }
        @keyframes recordPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
          50%       { box-shadow: 0 0 0 16px rgba(74,222,128,0); }
        }
        @keyframes shimmerText {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }

        .interview-root * { font-family: 'Sora', sans-serif; box-sizing: border-box; }
        .mono { font-family: 'JetBrains Mono', monospace !important; }

        .glass-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        .glass-card-warm {
          background: rgba(201,168,76,0.05);
          border: 1px solid rgba(201,168,76,0.12);
          backdrop-filter: blur(16px);
        }

        .mic-btn-idle {
          background: rgba(255,255,255,0.05);
          border: 2px solid rgba(255,255,255,0.15);
          cursor: not-allowed;
          opacity: 0.4;
        }
        .mic-btn-active {
          background: linear-gradient(135deg, #4ade80, #22c55e);
          border: none;
          cursor: pointer;
          animation: recordPulse 1.5s ease-in-out infinite;
        }
        .mic-btn-active:hover { transform: scale(1.05); }
      `}</style>

      <div className="interview-root" style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse 120% 80% at 50% -10%, rgba(20,20,35,1) 0%, #0a0a0f 50%)',
        display: 'flex', flexDirection: 'column',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Ambient background particles */}
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
          background:
            isListening
              ? 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(74,222,128,0.04) 0%, transparent 70%)'
              : state === 'anaya_speaking'
              ? 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(201,168,76,0.05) 0%, transparent 70%)'
              : state === 'processing'
              ? 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(139,92,246,0.04) 0%, transparent 70%)'
              : 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(30,30,60,0.3) 0%, transparent 70%)',
          transition: 'background 1.5s ease',
        }} />

        {/* Tab warning */}
        {tabWarning && (
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
            background: 'linear-gradient(90deg, #dc2626, #ef4444)',
            padding: '12px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            animation: 'tabWarningSlide 0.3s ease',
            boxShadow: '0 4px 24px rgba(220,38,38,0.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'white', margin: 0 }}>Tab switch detected</p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
                  This has been logged in your assessment report.
                </p>
              </div>
            </div>
            <button onClick={() => setTabWarning(false)} style={{
              background: 'rgba(0,0,0,0.2)', border: 'none', color: 'white',
              borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
            }}>Dismiss</button>
          </div>
        )}

        {/* Header */}
        <header style={{
          position: 'relative', zIndex: 10,
          padding: '14px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(10,10,15,0.7)',
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'linear-gradient(135deg, #c9a84c, #e8c96a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 13, color: '#0a0a0f',
            }}>C</div>
            <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.9)' }}>
              CUEMATH
            </span>
          </div>

          <div style={{
            fontSize: 11, color: 'rgba(255,255,255,0.4)',
            padding: '4px 12px', borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.08)',
            fontWeight: 500, letterSpacing: '0.05em',
          }}>
            {firstName} · AI Screening
          </div>
        </header>

        {/* Main layout */}
        <div style={{
          flex: 1, position: 'relative', zIndex: 1,
          display: 'grid',
          gridTemplateColumns: '200px 1fr',
          maxWidth: 900, margin: '0 auto', width: '100%',
          padding: '32px 20px', gap: 28,
        }}>

          {/* LEFT: Question Timeline */}
          <div style={{ paddingTop: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 16 }}>
              Progress
            </p>
            <QuestionTimeline current={questionNumber} total={4} />
          </div>

          {/* RIGHT: Main content */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Orb + status */}
            <div className="glass-card" style={{
              borderRadius: 28, padding: '32px 24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
            }}>
              {/* Anaya identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'flex-start' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(201,168,76,0.3), rgba(201,168,76,0.1))',
                  border: '1px solid rgba(201,168,76,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>🌸</div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', margin: 0 }}>Anaya</p>
                  <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: 0 }}>Cuemath Talent Team · AI Interviewer</p>
                </div>
                {isListening && (
                  <div style={{
                    marginLeft: 'auto',
                    fontSize: 11, color: '#4ade80', fontWeight: 600,
                    padding: '3px 10px', borderRadius: 12,
                    background: 'rgba(74,222,128,0.1)',
                    border: '1px solid rgba(74,222,128,0.25)',
                  }}>● LIVE</div>
                )}
                {isAnayaActive && !isListening && (
                  <div style={{
                    marginLeft: 'auto',
                    fontSize: 11, color: '#c9a84c', fontWeight: 600,
                    padding: '3px 10px', borderRadius: 12,
                    background: 'rgba(201,168,76,0.1)',
                    border: '1px solid rgba(201,168,76,0.25)',
                  }}>▶ SPEAKING</div>
                )}
              </div>

              {/* Breathing orb */}
              <BreathingOrb analyserNode={analyserNode} state={state} isListening={isListening} />

              {/* Status */}
              <div style={{ textAlign: 'center', minHeight: 28 }}>
                {state === 'processing' ? (
                  <ThinkingState />
                ) : (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0, fontStyle: 'italic' }}>
                    {orbLabel}
                  </p>
                )}
              </div>
            </div>

            {/* Cinematic transcript */}
            <div className="glass-card" style={{ borderRadius: 24, overflow: 'hidden' }}>
              <div style={{
                padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span className="mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.15em' }}>
                  TRANSCRIPT
                </span>
                <span className="mono" style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
                  {transcript.filter(e => e.role === 'anaya').length} / 5
                </span>
              </div>
              <div style={{ padding: '20px', maxHeight: 220, overflowY: 'auto' }}>
                <CinematicText entries={transcript} />
                {isListening && (
                  <div style={{
                    marginTop: 12, padding: '8px 14px', borderRadius: 10,
                    background: 'rgba(74,222,128,0.06)',
                    border: '1px solid rgba(74,222,128,0.15)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: '#4ade80', display: 'inline-block',
                      animation: 'dotPulse 1.2s ease-in-out infinite',
                    }} />
                    <span style={{ fontSize: 12, color: 'rgba(74,222,128,0.8)', fontStyle: 'italic' }}>
                      Recording your response...
                    </span>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>

            {/* Timeout nudge */}
            {timeoutMsg && (
              <div style={{
                textAlign: 'center', padding: '10px 16px', borderRadius: 12,
                background: 'rgba(201,168,76,0.06)',
                border: '1px solid rgba(201,168,76,0.15)',
              }}>
                <p style={{ fontSize: 12, color: 'rgba(201,168,76,0.8)', margin: 0 }}>⏱ {timeoutMsg}</p>
              </div>
            )}

            {/* Mic button */}
            {state !== 'complete' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={state === 'listening' ? handleStopRecording : undefined}
                  disabled={state !== 'listening'}
                  className={state === 'listening' ? 'mic-btn-active' : 'mic-btn-idle'}
                  style={{
                    width: 68, height: 68, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, transition: 'all 0.2s ease',
                  }}>
                  {state === 'listening' ? '⏹' : '🎙️'}
                </button>
                <p style={{
                  fontSize: 11, margin: 0,
                  color: state === 'listening' ? '#4ade80' : 'rgba(255,255,255,0.25)',
                }}>
                  {state === 'listening' ? 'Tap to send response' : 'Mic activates automatically'}
                </p>
              </div>
            )}

            {/* Complete */}
            {state === 'complete' && (
              <div className="glass-card-warm" style={{
                borderRadius: 20, padding: '24px', textAlign: 'center',
                animation: 'completePop 0.5s cubic-bezier(0.16,1,0.3,1)',
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✨</div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#c9a84c', margin: '0 0 4px' }}>
                  Interview complete
                </p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                  Generating your assessment report...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, fontFamily: 'sans-serif' }}>Loading...</p>
      </div>
    }>
      <InterviewContent />
    </Suspense>
  );
}
