'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<'intro' | 'form' | 'otp'>('intro');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resumeSession, setResumeSession] = useState<{
    sessionId: string;
    candidateName: string;
  } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('anaya_session');
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Date.now() - data.savedAt < 30 * 60 * 1000) {
        setResumeSession({ sessionId: data.sessionId, candidateName: data.candidateName });
      } else {
        localStorage.removeItem('anaya_session');
      }
    } catch { /* ignore */ }
  }, []);

  function handleResume() {
    if (!resumeSession) return;
    router.push(`/interview?session=${resumeSession.sessionId}&name=${encodeURIComponent(resumeSession.candidateName)}`);
  }

  function handleDismissResume() {
    localStorage.removeItem('anaya_session');
    setResumeSession(null);
  }

  function startResendCooldown() {
    setResendCooldown(30);
    const interval = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleSendOTP() {
    if (!name.trim() || !email.trim()) { setError('Both fields are required.'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email address.'); return; }
    setError('');
    setOtpSending(true);
    try {
      const res = await fetch('/api/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep('otp');
      setOtpValue('');
      setOtpError('');
      startResendCooldown();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code.');
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyAndStart() {
    if (otpValue.length !== 6) { setOtpError('Enter the 6-digit code.'); return; }
    setOtpError('');
    setOtpVerifying(true);
    try {
      // Verify OTP first
      const verifyRes = await fetch('/api/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: otpValue }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error);

      // OTP valid — create session
      setLoading(true);
      const sessionRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_name: name.trim(), candidate_email: email.trim() }),
      });
      const sessionData = await sessionRes.json();
      if (!sessionRes.ok) throw new Error(sessionData.error);

      router.push(`/miccheck?session=${sessionData.id}&name=${encodeURIComponent(name.trim())}`);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Invalid code. Try again.');
      setOtpVerifying(false);
      setLoading(false);
    }
  }

  function handleOtpInput(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const arr = otpValue.padEnd(6, ' ').split('');
    arr[index] = digit || ' ';
    const newOtp = arr.join('').trimEnd();
    setOtpValue(newOtp);
    if (digit && index < 5) {
      setTimeout(() => {
        const next = document.getElementById(`otp-${index + 1}`);
        next?.focus();
      }, 0);
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (!otpValue[index] && index > 0) {
        const arr = otpValue.padEnd(6, ' ').split('');
        arr[index - 1] = ' ';
        setOtpValue(arr.join('').trimEnd());
        setTimeout(() => {
          const prev = document.getElementById(`otp-${index - 1}`);
          prev?.focus();
        }, 0);
      }
    }
    if (e.key === 'Enter' && otpValue.replace(/\s/g, '').length === 6) {
      handleVerifyAndStart();
    }
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', zIndex: 1 }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background:
          'radial-gradient(ellipse 80% 60% at 10% 20%, rgba(201,168,76,0.07) 0%, transparent 60%), ' +
          'radial-gradient(ellipse 60% 50% at 90% 80%, rgba(99,102,241,0.05) 0%, transparent 60%)',
      }} />

      {/* Header */}
      <header style={{
        position: 'relative', zIndex: 2,
        padding: '20px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #c9a84c, #e8c96a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, color: '#0a0a0f',
          }}>C</div>
          <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '0.08em', color: 'var(--white)' }}>
            CUEMATH
          </span>
        </div>
        <span style={{
          fontSize: 11, color: 'var(--white-40)',
          border: '1px solid var(--border)',
          padding: '4px 12px', borderRadius: 20, letterSpacing: '0.05em',
        }}>
          TALENT SCREENER · CONFIDENTIAL
        </span>
      </header>

      <main style={{
        position: 'relative', zIndex: 2,
        maxWidth: 760, margin: '0 auto', padding: '60px 24px',
      }}>

        {/* ── INTRO STEP ── */}
        {step === 'intro' && (
          <div>
            {/* Resume banner */}
            {resumeSession && (
              <div className="fade-up glass" style={{
                borderRadius: 16, padding: '16px 20px', marginBottom: 28,
                borderColor: 'rgba(201,168,76,0.3)',
                background: 'rgba(201,168,76,0.06)',
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
              }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', marginBottom: 2 }}>
                    Resume your interview?
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--white-40)' }}>
                    You have an interview in progress as {resumeSession.candidateName}.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleDismissResume} className="btn-ghost"
                    style={{ padding: '8px 16px', borderRadius: 10, fontSize: 12 }}>
                    Start fresh
                  </button>
                  <button onClick={handleResume} className="btn-gold"
                    style={{ padding: '8px 16px', borderRadius: 10, fontSize: 12 }}>
                    Resume →
                  </button>
                </div>
              </div>
            )}

            <div className="fade-up" style={{ textAlign: 'center', marginBottom: 32 }}>
              <span style={{
                display: 'inline-block', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.2em', color: 'var(--gold)',
                textTransform: 'uppercase', marginBottom: 20,
              }}>
                Cuemath · Talent Team
              </span>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.05))',
                    border: '1px solid rgba(201,168,76,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
                  }}>🌸</div>
                  <div style={{
                    position: 'absolute', bottom: 2, right: 2,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#4ade80', border: '2px solid var(--bg)',
                  }} />
                </div>
              </div>

              <h1 style={{
                fontFamily: 'Cormorant Garamond',
                fontSize: 'clamp(36px, 6vw, 58px)',
                fontWeight: 700, lineHeight: 1.1, color: 'var(--white)', marginBottom: 16,
              }}>
                Meet Anaya,<br />
                <span className="gold-text">your AI interviewer</span>
              </h1>
              <p style={{
                fontSize: 16, color: 'var(--white-70)', lineHeight: 1.7,
                maxWidth: 480, margin: '0 auto',
              }}>
                A warm, 10-minute voice conversation to learn about your teaching style.
                No trick questions — just be yourself.
              </p>
            </div>

            {/* Feature cards */}
            <div className="fade-up-2" style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16, marginBottom: 40,
            }}>
              {[
                { icon: '🎙️', title: 'Voice Interview', desc: 'Speak naturally. Anaya listens and responds in real time.' },
                { icon: '📋', title: '4 Questions', desc: 'About your experience, teaching style, and real classroom situations.' },
                { icon: '⚡', title: 'Instant Report', desc: 'A detailed AI assessment is generated the moment you finish.' },
              ].map((item) => (
                <div key={item.title} className="glass" style={{ borderRadius: 20, padding: '24px 20px' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, marginBottom: 14,
                    background: 'var(--gold-lt)', border: '1px solid rgba(201,168,76,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                  }}>{item.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--white)', marginBottom: 6 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--white-70)', lineHeight: 1.6 }}>{item.desc}</div>
                </div>
              ))}
            </div>

            {/* Tips */}
            <div className="fade-up-3 glass" style={{
              borderRadius: 20, padding: '20px 24px', marginBottom: 36,
              borderColor: 'rgba(201,168,76,0.2)', background: 'rgba(201,168,76,0.04)',
            }}>
              <p style={{
                fontSize: 12, fontWeight: 600, color: 'var(--gold)',
                letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12,
              }}>Before you begin</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
                {[
                  'Find a quiet space with minimal background noise',
                  'Use Chrome or Edge for best voice recognition',
                  'Allow microphone access when prompted',
                  'Speak clearly and at a natural pace',
                ].map((tip) => (
                  <div key={tip} style={{ fontSize: 13, color: 'var(--white-70)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--gold)', marginTop: 1 }}>✓</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="fade-up-4" style={{ textAlign: 'center' }}>
              <button onClick={() => setStep('form')} className="btn-gold"
                style={{ padding: '16px 48px', borderRadius: 14, fontSize: 15 }}>
                I&apos;m ready — let&apos;s begin →
              </button>
            </div>
          </div>
        )}

        {/* ── FORM STEP ── */}
        {step === 'form' && (
          <div style={{ maxWidth: 440, margin: '0 auto' }} className="fade-up">
            <button onClick={() => setStep('intro')} style={{
              background: 'none', border: 'none', color: 'var(--white-40)',
              fontSize: 13, cursor: 'pointer', marginBottom: 32,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>← Back</button>

            <div className="glass" style={{ borderRadius: 24, padding: '40px 36px' }}>
              <div style={{ marginBottom: 28 }}>
                <span style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Step 1 of 2
                </span>
                <h2 style={{
                  fontFamily: 'Cormorant Garamond', fontSize: 32,
                  fontWeight: 700, color: 'var(--white)', marginTop: 8, marginBottom: 6,
                }}>
                  Your details
                </h2>
                <p style={{ fontSize: 14, color: 'var(--white-40)' }}>
                  We&apos;ll send a verification code to your email.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{
                    display: 'block', fontSize: 11, fontWeight: 600,
                    color: 'var(--white-40)', letterSpacing: '0.12em',
                    textTransform: 'uppercase', marginBottom: 8,
                  }}>Full Name</label>
                  <input
                    type="text" value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="input-dark"
                    style={{ width: '100%', padding: '13px 16px', borderRadius: 12, fontSize: 14 }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block', fontSize: 11, fontWeight: 600,
                    color: 'var(--white-40)', letterSpacing: '0.12em',
                    textTransform: 'uppercase', marginBottom: 8,
                  }}>Email Address</label>
                  <input
                    type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. priya@gmail.com"
                    className="input-dark"
                    onKeyDown={(e) => e.key === 'Enter' && handleSendOTP()}
                    style={{ width: '100%', padding: '13px 16px', borderRadius: 12, fontSize: 14 }}
                  />
                </div>

                {error && <p style={{ fontSize: 12, color: 'var(--danger)', margin: 0 }}>{error}</p>}

                <button
                  onClick={handleSendOTP} disabled={otpSending}
                  className="btn-gold"
                  style={{ padding: '14px', borderRadius: 12, fontSize: 14, marginTop: 4, opacity: otpSending ? 0.6 : 1 }}>
                  {otpSending ? 'Sending code...' : 'Send Verification Code →'}
                </button>
              </div>

              <p style={{ fontSize: 11, color: 'var(--white-40)', textAlign: 'center', marginTop: 20 }}>
                Your responses are kept confidential and used only for hiring evaluation.
              </p>
            </div>
          </div>
        )}

        {/* ── OTP STEP ── */}
        {step === 'otp' && (
          <div style={{ maxWidth: 440, margin: '0 auto' }} className="fade-up">
            <button onClick={() => { setStep('form'); setOtpValue(''); setOtpError(''); }} style={{
              background: 'none', border: 'none', color: 'var(--white-40)',
              fontSize: 13, cursor: 'pointer', marginBottom: 32,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>← Back</button>

            <div className="glass" style={{ borderRadius: 24, padding: '40px 36px' }}>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <span style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
                  Step 2 of 2
                </span>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', margin: '16px auto',
                  background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                }}>📧</div>
                <h2 style={{
                  fontFamily: 'Cormorant Garamond', fontSize: 28,
                  fontWeight: 700, color: 'var(--white)', marginBottom: 8,
                }}>Check your email</h2>
                <p style={{ fontSize: 13, color: 'var(--white-40)', lineHeight: 1.6 }}>
                  We sent a 6-digit code to<br />
                  <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{email}</span>
                </p>
              </div>

              {/* OTP boxes */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={otpValue[i] && otpValue[i] !== ' ' ? otpValue[i] : ''}
                    className="input-dark"
                    onChange={(e) => handleOtpInput(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    style={{
                      width: 48, height: 56, textAlign: 'center',
                      fontSize: 22, fontWeight: 700, borderRadius: 12, padding: 0,
                    }}
                  />
                ))}
              </div>

              {otpError && (
                <p style={{ fontSize: 12, color: 'var(--danger)', textAlign: 'center', marginBottom: 12 }}>
                  {otpError}
                </p>
              )}

              <button
                onClick={handleVerifyAndStart}
                disabled={otpVerifying || loading || otpValue.replace(/\s/g, '').length !== 6}
                className="btn-gold"
                style={{
                  width: '100%', padding: '14px', borderRadius: 12,
                  fontSize: 14, marginBottom: 16,
                  opacity: (otpVerifying || loading || otpValue.replace(/\s/g, '').length !== 6) ? 0.6 : 1,
                }}>
                {otpVerifying || loading ? 'Verifying...' : 'Verify & Start Interview →'}
              </button>

              <p style={{ fontSize: 12, color: 'var(--white-40)', textAlign: 'center' }}>
                Didn&apos;t receive it?{' '}
                {resendCooldown > 0 ? (
                  <span style={{ color: 'var(--white-40)' }}>Resend in {resendCooldown}s</span>
                ) : (
                  <button onClick={handleSendOTP} disabled={otpSending} style={{
                    background: 'none', border: 'none', color: 'var(--gold)',
                    cursor: 'pointer', fontSize: 12, padding: 0,
                    opacity: otpSending ? 0.6 : 1,
                  }}>
                    {otpSending ? 'Sending...' : 'Resend code'}
                  </button>
                )}
              </p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
