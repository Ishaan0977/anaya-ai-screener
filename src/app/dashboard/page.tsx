'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type SessionSummary = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  started_at: string;
  status: string;
  assessments: { verdict: string; verdict_reason: string; overall_score: number }[];
};

const VERDICT_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  Hire: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.25)' },
  Hold: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)' },
  Pass: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' },
};

type FilterType = 'All' | 'Hire' | 'Hold' | 'Pass';

export default function DashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('All');

  useEffect(() => {
    fetch('/api/session')
      .then(r => r.json())
      .then((data: SessionSummary[]) => { setSessions(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filter === 'All' ? sessions
    : sessions.filter(s => s.assessments?.[0]?.verdict === filter);

  const counts = {
    total: sessions.length,
    hire: sessions.filter(s => s.assessments?.[0]?.verdict === 'Hire').length,
    hold: sessions.filter(s => s.assessments?.[0]?.verdict === 'Hold').length,
    pass: sessions.filter(s => s.assessments?.[0]?.verdict === 'Pass').length,
  };

  return (
    <div style={{ minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(201,168,76,0.04) 0%, transparent 60%)',
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
          <span style={{ fontSize: 12, color: 'var(--white-40)', marginLeft: 4 }}>/ HR Dashboard</span>
        </div>
        <button onClick={() => router.push('/')} className="btn-gold" style={{ padding: '8px 18px', borderRadius: 10, fontSize: 13 }}>
          + New Interview
        </button>
      </header>

      <main style={{ position: 'relative', zIndex: 2, maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>

        <div className="fade-up" style={{ marginBottom: 32 }}>
          <span style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
            Talent Pipeline
          </span>
          <h1 style={{ fontFamily: 'Cormorant Garamond', fontSize: 40, color: 'var(--white)', marginTop: 6 }}>
            Candidate Overview
          </h1>
        </div>

        {/* Stats */}
        <div className="fade-up-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {[
            { label: 'Total Screened', value: counts.total, color: 'var(--white)' },
            { label: 'Recommend Hire', value: counts.hire,  color: '#4ade80' },
            { label: 'Hold for Review', value: counts.hold, color: '#fbbf24' },
            { label: 'Not Recommended', value: counts.pass, color: '#f87171' },
          ].map(stat => (
            <div key={stat.label} className="glass" style={{ borderRadius: 18, padding: '20px 16px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Cormorant Garamond', fontSize: 40, fontWeight: 700, color: stat.color, lineHeight: 1 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 11, color: 'var(--white-40)', marginTop: 6 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="fade-up-3" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {(['All', 'Hire', 'Hold', 'Pass'] as FilterType[]).map(f => {
            const active = filter === f;
            const vs = f !== 'All' ? VERDICT_STYLE[f] : null;
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '7px 18px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                background: active ? (vs?.bg ?? 'rgba(201,168,76,0.1)') : 'transparent',
                color: active ? (vs?.color ?? 'var(--gold)') : 'var(--white-40)',
                border: `1px solid ${active ? (vs?.border ?? 'rgba(201,168,76,0.3)') : 'var(--border)'}`,
                transition: 'all 0.2s',
              }}>
                {f}
              </button>
            );
          })}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', margin: '0 auto',
              border: '2px solid rgba(201,168,76,0.2)', borderTopColor: 'var(--gold)',
              animation: 'spin-slow 0.8s linear infinite',
            }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass fade-up" style={{ borderRadius: 24, padding: '60px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📭</div>
            <p style={{ fontFamily: 'Cormorant Garamond', fontSize: 22, color: 'var(--white)', marginBottom: 8 }}>
              No interviews yet
            </p>
            <p style={{ fontSize: 13, color: 'var(--white-40)' }}>
              Completed interviews will appear here.
            </p>
          </div>
        ) : (
          <div className="glass fade-up" style={{ borderRadius: 24, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Candidate', 'Date', 'Score', 'Verdict', ''].map(h => (
                    <th key={h} style={{
                      padding: '14px 20px', textAlign: 'left',
                      fontSize: 10, fontWeight: 600, color: 'var(--white-40)',
                      letterSpacing: '0.12em', textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const a = s.assessments?.[0];
                  const vs = a ? VERDICT_STYLE[a.verdict] : null;
                  return (
                    <tr key={s.id}
                      onClick={() => router.push(`/report/${s.id}`)}
                      style={{
                        borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                        cursor: 'pointer', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.03)'}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                    >
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: 500, fontSize: 14, color: 'var(--white)', marginBottom: 2 }}>
                          {s.candidate_name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--white-40)' }}>{s.candidate_email}</div>
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: 12, color: 'var(--white-40)' }}>
                        {new Date(s.started_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{ fontFamily: 'Cormorant Garamond', fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>
                          {a?.overall_score ?? '—'}
                        </span>
                        {a && <span style={{ fontSize: 12, color: 'var(--white-40)' }}>/5</span>}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        {vs ? (
                          <span style={{
                            padding: '4px 12px', borderRadius: 20,
                            fontSize: 11, fontWeight: 600,
                            background: vs.bg, color: vs.color, border: `1px solid ${vs.border}`,
                          }}>
                            {a?.verdict}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <span style={{ fontSize: 12, color: 'var(--gold)' }}>View →</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
