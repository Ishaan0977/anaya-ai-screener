'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type DimensionScore = {
  dimension: string;
  score: number;
  evidence_quote: string;
  notes: string;
};
type Assessment = {
  verdict: 'Hire' | 'Hold' | 'Pass';
  verdict_reason: string;
  overall_score: number;
  scores: DimensionScore[];
  red_flags: string[];
  standout_moments: string[];
};
type SessionData = {
  candidate_name: string;
  candidate_email: string;
  started_at: string;
  assessment: Assessment | null;
};

const VERDICTS = {
  Hire:  { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.25)',  label: '✓ Recommend · Move to Next Round' },
  Hold:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)',  label: '◎ Hold · Further Review Needed' },
  Pass:  { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)', label: '✕ Pass · Not Recommended' },
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 4 ? '#4ade80' : score === 3 ? '#fbbf24' : '#f87171';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{
            width: 18, height: 18, borderRadius: 4,
            background: i <= score ? color : 'rgba(255,255,255,0.08)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{score}/5</span>
    </div>
  );
}

export default function ReportPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [data, setData] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/session?id=${sessionId}`);
      const json = await res.json();
      if (!json.assessment && retries < 8) {
        setTimeout(() => setRetries(r => r + 1), 3000);
        return;
      }
      setData(json);
      setLoading(false);
    }
    load();
  }, [sessionId, retries]);

  function downloadPDF() {
    if (!data?.assessment) return;
    const { assessment: a, candidate_name, candidate_email } = data;
    const doc = new jsPDF();

    doc.setFontSize(22);
    doc.setTextColor(15, 76, 92);
    doc.text('Cuemath Tutor Screening Report', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Candidate: ${candidate_name} (${candidate_email})`, 14, 30);
    doc.text(`Date: ${new Date(data.started_at).toLocaleDateString('en-IN', { dateStyle: 'long' })}`, 14, 36);
    doc.text(`Overall Score: ${a.overall_score}/5  |  Verdict: ${a.verdict}`, 14, 42);
    doc.text(`Summary: ${a.verdict_reason}`, 14, 48);

    autoTable(doc, {
      startY: 58,
      head: [['Dimension', 'Score', 'Evidence Quote', 'Evaluator Notes']],
      body: a.scores.map(s => [s.dimension, `${s.score}/5`, `"${s.evidence_quote}"`, s.notes]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [15, 76, 92] },
      columnStyles: { 0: { cellWidth: 36 }, 1: { cellWidth: 14 }, 2: { cellWidth: 72 } },
    });

    const tableDoc = doc as jsPDF & { lastAutoTable: { finalY: number } };
    const finalY = tableDoc.lastAutoTable.finalY + 10;

    if (a.standout_moments?.length) {
      doc.setFontSize(11); doc.setTextColor(15, 76, 92);
      doc.text('Standout Moments', 14, finalY);
      doc.setFontSize(9); doc.setTextColor(60);
      a.standout_moments.forEach((m, i) => doc.text(`• ${m}`, 14, finalY + 8 + i * 7));
    }
    if (a.red_flags?.some(Boolean)) {
      doc.setFontSize(11); doc.setTextColor(220, 38, 38);
      doc.text('Red Flags', 14, finalY + 30);
      doc.setFontSize(9); doc.setTextColor(60);
      a.red_flags.filter(Boolean).forEach((f, i) => doc.text(`• ${f}`, 14, finalY + 38 + i * 7));
    }

    doc.save(`cuemath-${candidate_name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        border: '2px solid rgba(201,168,76,0.2)',
        borderTopColor: 'var(--gold)',
        animation: 'spin-slow 0.8s linear infinite',
      }} />
      <p style={{ fontSize: 14, color: 'var(--white-40)' }}>Anaya is reviewing your interview...</p>
    </div>
  );

  if (!data?.assessment) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: 'var(--white-40)', fontSize: 14 }}>Report not available yet. Please wait a moment and refresh.</p>
    </div>
  );

  const { assessment: a, candidate_name, candidate_email, started_at } = data;
  const vs = VERDICTS[a.verdict];

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(201,168,76,0.05) 0%, transparent 70%)',
      }} />

      <header style={{
        position: 'sticky', top: 0, zIndex: 10,
        padding: '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: 'linear-gradient(135deg, #c9a84c, #e8c96a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 12, color: '#0a0a0f',
          }}>C</div>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '0.08em' }}>CUEMATH</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={downloadPDF} className="btn-ghost" style={{ padding: '8px 18px', borderRadius: 10, fontSize: 13 }}>
            ↓ PDF Report
          </button>
          <button onClick={() => router.push('/dashboard')} className="btn-gold" style={{ padding: '8px 18px', borderRadius: 10, fontSize: 13 }}>
            HR Dashboard →
          </button>
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 2, maxWidth: 720, margin: '0 auto', padding: '36px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Hero card */}
        <div className="glass fade-up" style={{ borderRadius: 24, padding: '32px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
            <div>
              <span style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
                Assessment Report
              </span>
              <h1 style={{ fontFamily: 'Cormorant Garamond', fontSize: 36, fontWeight: 700, color: 'var(--white)', marginTop: 6, marginBottom: 4 }}>
                {candidate_name}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--white-40)' }}>{candidate_email}</p>
              <p style={{ fontSize: 12, color: 'var(--white-40)', marginTop: 4 }}>
                {new Date(started_at).toLocaleDateString('en-IN', { dateStyle: 'long' })}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Cormorant Garamond', fontSize: 56, fontWeight: 700, lineHeight: 1, color: 'var(--gold)' }}>
                {a.overall_score}
                <span style={{ fontSize: 24, color: 'var(--white-40)' }}>/5</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--white-40)', marginTop: 4 }}>Overall Score</p>
            </div>
          </div>

          {/* Verdict */}
          <div style={{
            padding: '14px 18px', borderRadius: 14,
            background: vs.bg, border: `1px solid ${vs.border}`,
          }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: vs.color, marginBottom: 4 }}>{vs.label}</p>
            <p style={{ fontSize: 13, color: 'var(--white-70)' }}>{a.verdict_reason}</p>
          </div>
        </div>

        {/* Dimension scores */}
        <div className="glass fade-up-2" style={{ borderRadius: 24, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
            <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: 22, color: 'var(--white)' }}>
              Dimension Breakdown
            </h2>
          </div>
          <div>
            {a.scores.map((s, i) => (
              <div key={s.dimension} style={{
                padding: '20px 24px',
                borderBottom: i < a.scores.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>{s.dimension}</h3>
                  <ScoreBar score={s.score} />
                </div>
                <div style={{
                  padding: '10px 14px', borderRadius: 10, marginBottom: 8,
                  background: 'rgba(201,168,76,0.05)',
                  borderLeft: '2px solid rgba(201,168,76,0.4)',
                }}>
                  <p style={{ fontSize: 13, color: 'var(--white-70)', fontStyle: 'italic', lineHeight: 1.6 }}>
                    &ldquo;{s.evidence_quote}&rdquo;
                  </p>
                </div>
                <p style={{ fontSize: 12, color: 'var(--white-40)', lineHeight: 1.6 }}>{s.notes}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Standout + Red flags */}
        <div className="fade-up-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {a.standout_moments?.length > 0 && (
            <div className="glass" style={{ borderRadius: 20, padding: '20px', borderColor: 'rgba(74,222,128,0.2)' }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: '#4ade80', marginBottom: 12, letterSpacing: '0.05em' }}>
                ✨ STANDOUT MOMENTS
              </h2>
              {a.standout_moments.map((m, i) => (
                <p key={i} style={{ fontSize: 13, color: 'var(--white-70)', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 8 }}>
                  &ldquo;{m}&rdquo;
                </p>
              ))}
            </div>
          )}
          {a.red_flags?.some(Boolean) && (
            <div className="glass" style={{ borderRadius: 20, padding: '20px', borderColor: 'rgba(248,113,113,0.2)' }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: '#f87171', marginBottom: 12, letterSpacing: '0.05em' }}>
                ⚠ RED FLAGS
              </h2>
              {a.red_flags.filter(Boolean).map((f, i) => (
                <p key={i} style={{ fontSize: 13, color: 'var(--white-70)', lineHeight: 1.6, marginBottom: 8 }}>
                  · {f}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Closing */}
        <div className="fade-up-4" style={{
          borderRadius: 24, padding: '32px', textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(201,168,76,0.08), rgba(201,168,76,0.03))',
          border: '1px solid rgba(201,168,76,0.15)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌸</div>
          <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: 24, color: 'var(--white)', marginBottom: 8 }}>
            Thank you for your time
          </h2>
          <p style={{ fontSize: 14, color: 'var(--white-40)', lineHeight: 1.7, maxWidth: 420, margin: '0 auto' }}>
            The Cuemath team will review your interview and be in touch within 2 business days.
            We appreciate you sharing your teaching philosophy with us.
          </p>
        </div>
      </main>
    </div>
  );
}
