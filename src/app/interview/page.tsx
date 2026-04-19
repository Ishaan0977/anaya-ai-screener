'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { useIntegrityMonitor } from '@/hooks/useIntegrityMonitor';

type TranscriptEntry = { role: 'anaya' | 'candidate'; text: string; timestamp: number };
type InterviewState = 'loading' | 'anaya_speaking' | 'waiting' | 'listening' | 'processing' | 'complete';

function AudioVisualizer({ analyserNode, isActive, isListening }: {
  analyserNode: AnalyserNode | null;
  isActive: boolean;
  isListening: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    cancelAnimationFrame(animRef.current);

    const BAR_COUNT = 40;
    const W = canvas.width;
    const H = canvas.height;

    if (!isActive && !isListening) {
      ctx.clearRect(0, 0, W, H);
      const barW = 3;
      const gap = (W - BAR_COUNT * barW) / (BAR_COUNT + 1);
      for (let i = 0; i < BAR_COUNT; i++) {
        const x = gap + i * (barW + gap);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.roundRect(x, H / 2 - 1.5, barW, 3, 2);
        ctx.fill();
      }
      return;
    }

    const dataArray = analyserNode
      ? new Uint8Array(analyserNode.frequencyBinCount)
      : null;
    let frame = 0;

    function draw() {
      animRef.current = requestAnimationFrame(draw);
      ctx!.clearRect(0, 0, W, H);
      frame++;
      const barW = 3;
      const gap = (W - BAR_COUNT * barW) / (BAR_COUNT + 1);
      for (let i = 0; i < BAR_COUNT; i++) {
        let value: number;
        if (dataArray && analyserNode) {
          analyserNode.getByteFrequencyData(dataArray);
          value = dataArray[Math.floor(i * (dataArray.length / BAR_COUNT))] / 255;
        } else {
          value = 0.15 + 0.25 * Math.abs(Math.sin(frame * 0.05 + i * 0.4));
        }
        const h = Math.max(3, value * H * 0.85);
        const x = gap + i * (barW + gap);
        const alpha = isListening ? 0.4 + value * 0.6 : 0.3 + value * 0.7;
        ctx!.fillStyle = `rgba(201,168,76,${alpha})`;
        ctx!.beginPath();
        ctx!.roundRect(x, (H - h) / 2, barW, h, 2);
        ctx!.fill();
      }
    }
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [analyserNode, isActive, isListening]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={56}
      style={{ width: '100%', maxWidth: 320 }}
    />
  );
}

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
  const [statusMsg, setStatusMsg] = useState('Connecting to Anaya...');
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

  // ── Play local opening MP3 — no ElevenLabs token used ──
  const playOpeningAudio = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const audio = new Audio('/anaya-opening.mp3');
      audio.onended = () => resolve();
      audio.onerror = () => resolve(); // resolve even if file missing
      audio.play().catch(() => resolve());
    });
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Save progress to localStorage for session resume
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

  // Tab switch warning
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
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function clearTimeouts() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }

  const saveTranscriptTurn = useCallback(
    async (role: 'anaya' | 'candidate', text: string, index: number) => {
      await fetch('/api/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId, action: 'add_turn',
          role, text, turn_index: index, timestamp_ms: Date.now(),
        }),
      });
    },
    [sessionId]
  );

  const triggerAssessment = useCallback(async () => {
    setState('complete');
    setStatusMsg('Generating your assessment report...');
    clearTimeouts();
    try {
      await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, integrity_signals: signals }),
      });
    } catch { /* still redirect */ }
    router.push(`/report/${sessionId}`);
  }, [sessionId, router, signals]);

  const autoStartMic = useCallback(async () => {
    recordResponseStart();
    setState('listening');
    setStatusMsg('Your turn — speak now...');
    startListening();
  }, [startListening, recordResponseStart]);

  const sendToAnaya = useCallback(
    async (
      currentTranscript: TranscriptEntry[],
      currentTurn: number,
      currentFollowUpCount: number,
      currentFollowUpUsedFor: number | null
    ) => {
      setState('processing');
      setStatusMsg('Anaya is thinking...');
      clearTimeouts();
      setTimeoutMsg('');

      try {
        // ── Turn 0: play local MP3, no API call ──
        if (currentTurn === 0) {
          const openingText = `Hi there! I'm Anaya from Cuemath's talent team — thanks so much for making time today. This will be a relaxed ten-minute conversation just a change to get to know you better. No trick questions — just be yourself. Shall we begin?`;

          setTranscript([{ role: 'anaya', text: openingText, timestamp: Date.now() }]);
          setTurnIndex(1);
          setState('anaya_speaking');
          setStatusMsg('Anaya is speaking...');

          await playOpeningAudio();

          // Queue mic start via pendingTurnRef so the isPlaying effect handles it
          // But since we used a local Audio element (not useAudioPlayer),
          // we call autoStartMic directly here
          setState('waiting');
          setStatusMsg('Your turn — speak now...');
          await autoStartMic();
          return;
        }

        // ── All other turns: stream from API ──
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            candidate_name: candidateName,
            transcript: currentTranscript,
            turn_index: currentTurn,
            follow_up_count: currentFollowUpCount,
            follow_up_used_for: currentFollowUpUsedFor,
            stream: true,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(err.error ?? 'API error');
        }

        if (!res.body) throw new Error('No response body');

        // ── Parse SSE stream ──
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let anayaText = '';
        let metadata: {
          done?: boolean;
          text?: string;
          next_turn?: number;
          interview_complete?: boolean;
          question_number?: number;
          follow_up_count?: number;
          follow_up_used_for?: number | null;
          error?: string;
        } = {};

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            const lines = part.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.chunk) anayaText += parsed.chunk;
                if (parsed.done) {
                  metadata = parsed;
                  if (parsed.text) anayaText = parsed.text;
                }
                if (parsed.error) throw new Error(parsed.error);
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                throw e;
              }
            }
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          for (const line of buffer.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed.chunk) anayaText += parsed.chunk;
              if (parsed.done && parsed.text) anayaText = parsed.text;
              if (parsed.error) throw new Error(parsed.error);
            } catch (e) {
              if (!(e instanceof SyntaxError)) throw e;
            }
          }
        }

        if (!anayaText.trim()) throw new Error('Empty response from AI');
        anayaText = anayaText.trim();

        // Update metadata
        if (typeof metadata.question_number === 'number') setQuestionNumber(metadata.question_number);
        if (typeof metadata.follow_up_count === 'number') setFollowUpCount(metadata.follow_up_count);
        if (metadata.follow_up_used_for !== undefined) setFollowUpUsedFor(metadata.follow_up_used_for ?? null);

        // Add to transcript
        setTranscript((prev) => [...prev, { role: 'anaya', text: anayaText, timestamp: Date.now() }]);
        setTurnIndex(metadata.next_turn ?? currentTurn + 1);

        setState('anaya_speaking');
        setStatusMsg('Anaya is speaking...');

        // Play via ElevenLabs (useAudioPlayer)
        // The isPlaying effect below will auto-start mic when done
        if (metadata.interview_complete) {
          await playText(anayaText);
          await triggerAssessment();
        } else {
          pendingTurnRef.current = {
            transcript: currentTranscript,
            turn: currentTurn,
            followUpCount: currentFollowUpCount,
            followUpUsedFor: currentFollowUpUsedFor,
          };
          await playText(anayaText);
        }

      } catch (err) {
        console.error('sendToAnaya error:', err);
        setState('waiting');
        setStatusMsg(`Something went wrong — tap mic to try again`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, candidateName, playText, triggerAssessment, autoStartMic, playOpeningAudio]
  );

  function startTimeoutWatcher(
    currentTranscript: TranscriptEntry[],
    currentTurn: number,
    currentFollowUpCount: number,
    currentFollowUpUsedFor: number | null
  ) {
    clearTimeouts();
    setTimeoutMsg('');

    timeoutRef.current = setTimeout(() => {
      setTimeoutMsg("Take your time — respond whenever you're ready.");
      timeoutRef.current = setTimeout(async () => {
        setTimeoutMsg('');
        await stopListening();
        const entry: TranscriptEntry = {
          role: 'candidate',
          text: '[No response — candidate did not answer in time]',
          timestamp: Date.now(),
        };
        const newTranscript = [...currentTranscript, entry];
        setTranscript(newTranscript);
        await saveTranscriptTurn('candidate', entry.text, currentTurn);
        await sendToAnaya(newTranscript, currentTurn + 1, currentFollowUpCount, currentFollowUpUsedFor);
      }, SKIP_TIMEOUT - PROMPT_TIMEOUT);
    }, PROMPT_TIMEOUT);
  }

  // Watch for audio finishing → auto-start mic
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
    setStatusMsg('Processing your response...');
    const spoken = await stopListening();

    if (!spoken || spoken.trim().length < 2) {
      setStatusMsg("Didn't catch that — mic is on again");
      await autoStartMic();
      return;
    }

    const entry: TranscriptEntry = { role: 'candidate', text: spoken, timestamp: Date.now() };
    const newTranscript = [...transcript, entry];
    setTranscript(newTranscript);
    await saveTranscriptTurn('candidate', spoken, turnIndex);
    await sendToAnaya(newTranscript, turnIndex + 1, followUpCount, followUpUsedFor);
  }

  const progress = Math.min((questionNumber / 4) * 100, 100);
  const isAnayaActive = isPlaying || isFetching;

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 50% 40% at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 70%)',
      }} />

      {/* Tab switch warning banner */}
      {tabWarning && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          background: 'rgba(248,113,113,0.95)',
          backdropFilter: 'blur(8px)',
          padding: '12px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          animation: 'fade-in 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'white', margin: 0 }}>
                Tab switch detected
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', margin: 0 }}>
                Please stay on this tab during the interview. This has been noted in your assessment.
              </p>
            </div>
          </div>
          <button onClick={() => setTabWarning(false)} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none',
            color: 'white', borderRadius: 8, padding: '6px 14px',
            fontSize: 12, cursor: 'pointer', fontWeight: 600,
          }}>Dismiss</button>
        </div>
      )}

      {/* Header */}
      <header style={{
        position: 'relative', zIndex: 2,
        padding: '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(10,10,15,0.8)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg, #c9a84c, #e8c96a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 12, color: '#0a0a0f',
          }}>C</div>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.08em', color: 'var(--white)' }}>
            CUEMATH
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--white-40)' }}>
            {questionNumber > 0 ? `Question ${questionNumber} of 4` : 'Starting up'}
          </span>
          <div style={{ width: 80, height: 3, borderRadius: 4, background: 'var(--white-15)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              background: 'linear-gradient(90deg, #c9a84c, #e8c96a)',
              width: `${progress}%`,
              transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)',
            }} />
          </div>
        </div>

        <div style={{
          fontSize: 12, color: 'var(--gold)',
          padding: '4px 12px', borderRadius: 20,
          border: '1px solid rgba(201,168,76,0.25)',
          background: 'var(--gold-lt)',
        }}>
          {firstName}
        </div>
      </header>

      <main style={{
        position: 'relative', zIndex: 2,
        maxWidth: 640, margin: '0 auto', padding: '32px 20px',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>

        {/* Anaya card */}
        <div className="glass fade-up" style={{ borderRadius: 24, padding: '28px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))',
              border: '1px solid rgba(201,168,76,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
            }}>🌸</div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--white)' }}>Anaya</p>
              <p style={{ fontSize: 12, color: 'var(--white-40)' }}>Cuemath Talent Team</p>
            </div>
            {isAnayaActive && (
              <div style={{
                fontSize: 11, color: 'var(--gold)',
                padding: '4px 10px', borderRadius: 20,
                border: '1px solid rgba(201,168,76,0.25)',
                background: 'var(--gold-lt)',
              }}>
                {isFetching ? '● Thinking' : '▶ Speaking'}
              </div>
            )}
            {isListening && (
              <div style={{
                fontSize: 11, color: '#4ade80',
                padding: '4px 10px', borderRadius: 20,
                border: '1px solid rgba(74,222,128,0.3)',
                background: 'rgba(74,222,128,0.1)',
              }}>
                ● Listening
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <AudioVisualizer
              analyserNode={analyserNode}
              isActive={isAnayaActive}
              isListening={isListening}
            />
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--white-40)' }}>
            {statusMsg}
          </p>
        </div>

        {/* Transcript — Anaya only */}
        <div className="glass fade-up-2" style={{ borderRadius: 24, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--white-40)',
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>Anaya&apos;s Questions</span>
          </div>

          <div style={{
            padding: '16px', maxHeight: 280, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {transcript.filter(e => e.role === 'anaya').length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--white-40)', fontSize: 13, padding: '24px 0' }}>
                Questions will appear here...
              </p>
            )}

            {transcript
              .filter((entry) => entry.role === 'anaya')
              .map((entry, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, rgba(201,168,76,0.3), rgba(201,168,76,0.1))',
                    border: '1px solid rgba(201,168,76,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, color: 'var(--gold)',
                  }}>A</div>
                  <div style={{
                    maxWidth: '85%', padding: '10px 14px',
                    fontSize: 13, lineHeight: 1.6,
                    background: 'rgba(201,168,76,0.07)',
                    border: '1px solid rgba(201,168,76,0.15)',
                    color: 'var(--white-70)',
                    borderRadius: '4px 14px 14px 14px',
                  }}>
                    {entry.text}
                  </div>
                </div>
              ))}

            {/* Recording indicator */}
            {isListening && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                <div style={{
                  padding: '8px 14px', borderRadius: '14px 4px 14px 14px',
                  fontSize: 13, background: 'rgba(74,222,128,0.05)',
                  border: '1px solid rgba(74,222,128,0.2)',
                  color: '#4ade80',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#4ade80', display: 'inline-block',
                    animation: 'pulse-record 1.4s ease-in-out infinite',
                  }} />
                  Recording...
                </div>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: 'var(--white-70)',
                }}>
                  {(firstName[0] ?? 'C').toUpperCase()}
                </div>
              </div>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Timeout nudge */}
        {timeoutMsg && (
          <div className="fade-in" style={{
            textAlign: 'center', padding: '10px 16px', borderRadius: 12,
            background: 'rgba(201,168,76,0.06)',
            border: '1px solid rgba(201,168,76,0.15)',
          }}>
            <p style={{ fontSize: 13, color: 'var(--gold)' }}>⏱ {timeoutMsg}</p>
          </div>
        )}

        {/* Mic control */}
        {state !== 'complete' && (
          <div className="fade-up-3" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            {state === 'listening' ? (
              <>
                <button
                  onClick={handleStopRecording}
                  className="pulse-record"
                  style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
                  }}>⏹</button>
                <p style={{ fontSize: 12, color: '#4ade80' }}>Tap to send your response</p>
              </>
            ) : (
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26, opacity: 0.3,
              }}>🎙️</div>
            )}
          </div>
        )}

        {state === 'complete' && (
          <div className="fade-in glass" style={{
            borderRadius: 20, padding: '20px', textAlign: 'center',
            borderColor: 'rgba(201,168,76,0.2)', background: 'rgba(201,168,76,0.04)',
          }}>
            <p style={{ fontSize: 14, color: 'var(--gold)' }}>
              ✨ Interview complete — generating your report...
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--white-40)', fontSize: 14 }}>Loading...</p>
      </div>
    }>
      <InterviewContent />
    </Suspense>
  );
}
