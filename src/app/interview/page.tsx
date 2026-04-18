'use client';
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';

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

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  const { stopListening, startListening, isListening } = useSpeechRecognition();
  const { isPlaying, isFetching, playText, analyserNode } = useAudioPlayer();

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const saveTranscriptTurn = useCallback(
    async (role: 'anaya' | 'candidate', text: string, index: number) => {
      await fetch('/api/session', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          action: 'add_turn',
          role,
          text,
          turn_index: index,
          timestamp_ms: Date.now(),
        }),
      });
    },
    [sessionId]
  );

  const triggerAssessment = useCallback(async () => {
    setState('complete');
    setStatusMsg('Generating your assessment report...');
    try {
      await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch {
      // still redirect even if assess fails
    }
    router.push(`/report/${sessionId}`);
  }, [sessionId, router]);

  const sendToAnaya = useCallback(
    async (
      currentTranscript: TranscriptEntry[],
      currentTurn: number,
      currentFollowUpCount: number,
      currentFollowUpUsedFor: number | null
    ) => {
      setState('processing');
      setStatusMsg('Anaya is thinking...');
      try {
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
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        if (data.interview_complete && !data.text) {
          await triggerAssessment();
          return;
        }

        if (typeof data.question_number === 'number') setQuestionNumber(data.question_number);
        if (typeof data.follow_up_count === 'number') setFollowUpCount(data.follow_up_count);
        if (data.follow_up_used_for !== undefined) setFollowUpUsedFor(data.follow_up_used_for);

        const newEntry: TranscriptEntry = {
          role: 'anaya',
          text: data.text,
          timestamp: Date.now(),
        };
        setTranscript((prev) => [...prev, newEntry]);
        setTurnIndex(data.next_turn);

        setState('anaya_speaking');
        setStatusMsg('Anaya is speaking...');
        await playText(data.text);

        if (data.interview_complete) {
          await triggerAssessment();
        } else {
          setState('waiting');
          setStatusMsg('Your turn — press the mic to respond');
        }
      } catch (err) {
        console.error(err);
        setStatusMsg('Connection issue. Please refresh the page.');
      }
    },
    [sessionId, candidateName, playText, triggerAssessment]
  );

  useEffect(() => {
    if (!sessionId || hasStarted.current) return;
    hasStarted.current = true;
    sendToAnaya([], 0, 0, null);
  }, [sessionId, sendToAnaya]);

  async function handleStartRecording() {
    if (state !== 'waiting') return;
    setState('listening');
    setStatusMsg('Recording — speak now...');
    startListening();
  }

  async function handleStopRecording() {
    if (state !== 'listening') return;
    setState('processing');
    setStatusMsg('Processing your response...');
    const spoken = await stopListening();

    if (!spoken || spoken.trim().length < 2) {
      setStatusMsg("Didn't catch that — try again");
      setState('waiting');
      return;
    }

    const entry: TranscriptEntry = {
      role: 'candidate',
      text: spoken,
      timestamp: Date.now(),
    };
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

        {/* Transcript — shows confirmed turns only, no live STT */}
        <div className="glass fade-up-2" style={{ borderRadius: 24, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: 'var(--white-40)',
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>Anaya's Questions</span>
          </div>

          <div style={{
            padding: '16px', maxHeight: 280, overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {transcript.length === 0 && (
              <p style={{
                textAlign: 'center', color: 'var(--white-40)',
                fontSize: 13, padding: '24px 0',
              }}>
                The conversation will appear here...
              </p>
            )}

            {transcript
  .filter((entry) => entry.role === 'anaya')
  .map((entry, i) => (
    <div key={i} style={{
      display: 'flex', flexDirection: 'row',
      gap: 10, alignItems: 'flex-start',
    }}>
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

            {/* Show "recording..." indicator instead of raw STT */}
            {isListening && (
              <div style={{
                display: 'flex', flexDirection: 'row-reverse',
                gap: 10, alignItems: 'center',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600, color: 'var(--white-70)',
                }}>
                  {(firstName[0] ?? 'C').toUpperCase()}
                </div>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '14px 4px 14px 14px',
                  fontSize: 13,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border)',
                  color: 'var(--gold)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--gold)',
                    display: 'inline-block',
                    animation: 'pulse-record 1.4s ease-in-out infinite',
                  }} />
                  Recording...
                </div>
              </div>
            )}

            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Mic control */}
        {state !== 'complete' && (
          <div className="fade-up-3" style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 12,
          }}>
            {state === 'listening' ? (
              <>
                <button
                  onClick={handleStopRecording}
                  className="pulse-record"
                  style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #c9a84c, #e8c96a)',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 26,
                  }}>⏹</button>
                <p style={{ fontSize: 12, color: 'var(--gold)' }}>
                  Recording — tap when done
                </p>
              </>
            ) : state === 'waiting' ? (
              <>
                <button
                  onClick={handleStartRecording}
                  style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'rgba(201,168,76,0.1)',
                    border: '1px solid rgba(201,168,76,0.3)',
                    cursor: 'pointer', transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 26,
                  }}
                  onMouseEnter={e => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.style.background = 'rgba(201,168,76,0.2)';
                    btn.style.borderColor = 'rgba(201,168,76,0.6)';
                    btn.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={e => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.style.background = 'rgba(201,168,76,0.1)';
                    btn.style.borderColor = 'rgba(201,168,76,0.3)';
                    btn.style.transform = 'scale(1)';
                  }}>
                  🎙️
                </button>
                <p style={{ fontSize: 12, color: 'var(--white-40)' }}>Tap to respond</p>
              </>
            ) : (
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 26, opacity: 0.3,
              }}>🎙️</div>
            )}
          </div>
        )}

        {state === 'complete' && (
          <div className="fade-in glass" style={{
            borderRadius: 20, padding: '20px', textAlign: 'center',
            borderColor: 'rgba(201,168,76,0.2)',
            background: 'rgba(201,168,76,0.04)',
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
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ color: 'var(--white-40)', fontSize: 14 }}>Loading...</p>
      </div>
    }>
      <InterviewContent />
    </Suspense>
  );
}
