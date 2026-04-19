# Anaya — Voice AI Interviewer

> An end-to-end AI-powered voice screening system that conducts real interviews, evaluates candidates across 5 dimensions, and generates structured assessment reports — with zero human involvement.

[![Next.js](https://img.shields.io/badge/Next.js_14-black?style=flat&logo=next.js)](https://nextjs.org)
[![Gemini](https://img.shields.io/badge/Gemini_1.5-4285F4?style=flat&logo=google)](https://ai.google.dev)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Vercel-black?style=flat&logo=vercel)](https://vercel.com)

---

## What is this?

Anaya is a production-grade voice interviewing system. A candidate opens a link, verifies their email, checks their mic, and has a natural 10-minute spoken conversation with an AI interviewer. The moment they finish, a structured assessment report is generated — scored across 5 dimensions with verbatim evidence quotes, a hire/hold/pass verdict, a tone analysis badge, and interview integrity signals.

HR gets a filterable dashboard of all candidates and a one-click PDF report for each one.

**This is not a chatbot. It is a complete hiring tool.**

---

## Live Demo

🔗 **[Try it here →](https://your-vercel-url.vercel.app)**

---

## Features

### For Candidates
- **Warm onboarding** — clear expectations, pre-interview tips, professional feel
- **Email OTP verification** — 6-digit code, 10-minute expiry, branded HTML email
- **Mic check** — 4-second audio test played back before the interview starts
- **Voice-first interview** — speak naturally, mic auto-activates after each question
- **Live audio visualizer** — real-time waveform via Web Audio API
- **Session resume** — refresh the page mid-interview and pick up exactly where you left off

### For the AI (Anaya)
- **Fully adaptive questions** — Gemini generates fresh questions every interview, no two are the same
- **References your words** — Anaya picks up on what you said and follows up on it
- **Two-layer follow-up system:**
  - Short answer (< 12 words) → gentle probe before moving on
  - Substantive answer → genuine follow-up referencing your specific words
- **Timeout handling** — nudge at 45s, auto-advance at 90s
- **No coaching** — hard prompt rules: Anaya never says "great answer" or gives feedback

### For HR
- **Structured assessment report** — 5 dimensions, each scored 1–5 with a verbatim quote
- **Verdict logic** — Hire / Hold / Pass with a one-line reason
- **Tone badge** — one-word characterisation: Empathetic, Structured, Enthusiastic, etc.
- **Interview integrity signals** — tab switches, response timing, long pauses, fast responses
- **Standout moments** — the best thing the candidate said, verbatim
- **Red flags** — any concerns flagged by the AI evaluator
- **PDF export** — one-click downloadable report
- **HR dashboard** — all candidates, filterable by verdict, aggregate stats

---

## Tech Stack

| | Technology | Purpose |
|---|---|---|
| **Framework** | Next.js 14 (App Router) | Frontend + API routes in one project |
| **AI — Conversation** | Google Gemini 1.5 Flash-8B | Adaptive interview questions |
| **AI — Assessment** | Google Gemini 1.5 Flash-8B | Structured evaluation + scoring |
| **Voice STT** | Web Speech API + Groq Whisper | Browser-native + fallback transcription |
| **Voice TTS** | ElevenLabs `eleven_turbo_v2` | Natural AI voice output |
| **Database** | Supabase (PostgreSQL) | Sessions, transcripts, reports, OTPs |
| **Email** | Resend | Branded OTP verification emails |
| **PDF** | jsPDF + AutoTable | Client-side report export |
| **Deployment** | Vercel | Zero-config, serverless |

---

## Architecture

Everything lives in a single Next.js project. No separate backend.

```
Browser (React)
    │
    │  fetch() — HTTPS only
    │
Next.js API Routes (server-side)
    ├── /api/chat        → Gemini conversation engine
    ├── /api/assess      → Gemini assessment + scoring
    ├── /api/tts         → ElevenLabs TTS (audio stream)
    ├── /api/transcribe  → Groq Whisper fallback
    ├── /api/session     → Supabase CRUD
    ├── /api/otp/send    → Resend email OTP
    └── /api/otp/verify  → OTP validation
```

All AI API keys (Gemini, ElevenLabs, Groq) are server-side only — they never reach the browser.

---

## Security

| What | How |
|---|---|
| **API keys** | Stored as Vercel environment variables. Never in frontend code, never in git. |
| **AI calls** | All proxied through server-side API routes. Keys never exposed to browser. |
| **Database** | Supabase Row Level Security on all tables. Service role key server-side only. |
| **OTP** | 10-minute expiry, single-use, previous codes deleted on resend. |
| **Public keys** | Only `NEXT_PUBLIC_` prefix on Supabase URL + anon key — intentionally public by design. |

---

## Assessment Dimensions

| Dimension | What it measures |
|---|---|
| Communication Clarity | Structured, easy to follow, no confusion |
| Warmth & Patience | Kind, calm, student-centered language |
| Ability to Simplify | Can explain concepts simply and clearly |
| English Fluency | Grammar, vocabulary, confidence |
| Adaptability | Reads cues, flexible, creative problem-solving |

Each scored 1–5 with a **verbatim quote from the candidate** as evidence.

**Verdict logic:**
- `Hire` — overall ≥ 4.0, no dimension below 3
- `Hold` — overall 3.0–3.9, or one dimension below 3
- `Pass` — overall < 3.0, or two+ dimensions below 3

---

## Interview Integrity

Every interview passively tracks:
- **Tab switches** — did the candidate leave the tab?
- **Fast responses** — responses starting in < 2s (possible copy-paste)
- **Long pauses** — questions with > 30s delay before responding
- **Average response time** — baseline for natural pace

A visible warning banner appears immediately on tab switch during the interview. All signals are stored and shown on the HR report as context — not automatic disqualifiers.

---

## Interesting Engineering Decisions

**Auto-mic activation**
The mic turns on automatically the moment the AI finishes speaking. No button press. This is the single change that makes it feel like a real conversation instead of a form.

**Two-model split**
Chat and assessment use the same model family but different configurations — different temperature, different token budget, different prompt structure. They draw from separate quota buckets, which maximises free tier headroom.

**Retry with exponential backoff**
Both chat and assessment routes retry on 429 rate limits with 15s/30s/45s waits. Assessment has a fallback report that saves to DB even if all retries fail — the candidate experience never breaks.

**Dynamic questions, not a fixed pool**
Gemini generates fresh question phrasing every interview and references what the candidate said when transitioning. The tradeoff is one extra LLM call per turn — worth it for the naturalness.

**Integrity signals without invasiveness**
No screen recording, no webcam, no keystroke logging. Only passive behavioural signals: tab visibility, response timing. Presented as context for reviewers, not automatic flags.

**Server-side TTS proxy**
ElevenLabs audio is fetched server-side and returned as `ArrayBuffer`. ElevenLabs key never touches the browser. Audio loads in a single request with no CORS issues.

---

## What I'd Add Next

- **Streaming TTS** — first sentence plays while the rest generates (~60% latency reduction)
- **Interrupt detection** — AI pauses if candidate speaks mid-response
- **Multilingual support** — regional language toggle for broader candidate reach
- **Radar chart** — spider chart of all 5 dimensions on the report
- **Score calibration** — align AI verdicts with historical human reviewer decisions
- **Aggregate analytics** — conversion rates, score distributions, dimension trends over time
- **HR email notifications** — send verdict + report link on interview completion

---

## Local Setup

```bash
git clone https://github.com/YOUR_USERNAME/anaya-ai-screener
cd anaya-ai-screener
npm install
```

Create `.env.local`:

```env
GEMINI_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
GROQ_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

```bash
npm run dev
# http://localhost:3000
```

### Supabase Setup

Run the SQL in `/supabase/schema.sql` in your Supabase SQL editor.

---

## Deploy

```bash
npm i -g vercel
vercel --prod
```

Add all env vars in **Vercel Dashboard → Project → Settings → Environment Variables**.

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Onboarding + OTP
│   ├── miccheck/page.tsx     # Pre-interview mic test
│   ├── interview/page.tsx    # Live voice interview
│   ├── report/[id]/page.tsx  # Assessment report
│   ├── dashboard/page.tsx    # HR dashboard
│   └── api/
│       ├── chat/             # Gemini conversation
│       ├── assess/           # Gemini assessment
│       ├── tts/              # ElevenLabs TTS
│       ├── transcribe/       # Groq Whisper
│       ├── session/          # Supabase CRUD
│       └── otp/              # Email verification
├── hooks/
│   ├── useSpeechRecognition.ts
│   ├── useAudioPlayer.ts
│   └── useIntegrityMonitor.ts
├── lib/
│   ├── gemini.ts             # Prompts + model config
│   └── supabase.ts           # DB client
└── types/
    └── index.ts
```

---

## LinkedIn Caption (copy-paste ready)

```
🎙️ Built an end-to-end AI voice interviewer from scratch.

Anaya conducts real screening interviews — asks adaptive questions,
follows up on interesting answers, probes vague ones, and generates
a structured assessment report the moment the conversation ends.

What's under the hood:
→ Gemini 1.5 for adaptive conversation + assessment
→ ElevenLabs for natural AI voice
→ Web Speech API + Groq Whisper for transcription
→ Email OTP verification before interviews start
→ Interview integrity signals (tab switches, response timing)
→ Session resume if the page refreshes mid-interview
→ Full HR dashboard with PDF export

Everything runs in a single Next.js project.
All AI keys server-side only — never in the browser.

Live demo: [your-url]
GitHub: [your-repo]

#buildinpublic #ai #nextjs #gemini #voiceai #fullstack
```

---

*Built with attention to every detail — from the auto-activating mic to the integrity signal tracking. This is what production AI tooling looks like.*
