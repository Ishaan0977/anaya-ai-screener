# Anaya — Voice AI Interviewer

> An end-to-end AI voice screening system. Candidates have a natural spoken conversation with an AI interviewer. HR gets a structured assessment report with scores, evidence quotes, and a hire/hold/pass verdict — instantly, automatically, at any scale.

[![Next.js](https://img.shields.io/badge/Next.js_14-black?style=flat&logo=next.js)](https://nextjs.org)
[![Gemini](https://img.shields.io/badge/Gemini_3.1-4285F4?style=flat&logo=google)](https://ai.google.dev)
[![Groq](https://img.shields.io/badge/Groq_Fallback-F55036?style=flat)](https://groq.com)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase)](https://supabase.com)
[![Vercel](https://img.shields.io/badge/Vercel-black?style=flat&logo=vercel)](https://vercel.com)

---

## 🔗 Live Demo
**[Try it here →](https://anaya-ai-screener.vercel.app/)** : https://anaya-ai-screener.vercel.app 

*(Evaluator Note: Use `test@gmail.com` to bypass the email OTP verification and instantly enter the interview with code `123456`)*

---

## 💡 The Problem It Solves
Traditional hiring requires hours of human capital to conduct initial 10-minute phone screens. Anaya automates the entire top-of-funnel screening process. It ensures every candidate gets a fair, bias-free, and adaptive interview, while providing HR with structured, data-backed hiring signals instantly.

---

## ✨ Features

### For Candidates
- **Warm onboarding** — clear expectations, pre-interview tips, professional feel.
- **Email OTP verification** — 6-digit code via Resend, 10-minute expiry, branded HTML email.
- **Mic check** — 4-second audio test played back before the interview starts.
- **Voice-first interview** — speak naturally, mic auto-activates after each question.
- **Live audio visualizer** — real-time waveform via Web Audio API.
- **Session resume** — refresh the page mid-interview and pick up exactly where you left off.

### For the AI (Anaya)
- **Streaming responses** — text appears word-by-word via SSE; ElevenLabs speaks the full sentence once complete.
- **Fully adaptive questions** — Gemini generates fresh questions every interview.
- **Two-layer follow-up system:**
  - Short answer (< 12 words) → gentle probe before moving on.
  - Substantive answer → follow-up referencing candidate’s response.
- **Timeout handling** — nudge at 45s, auto-advance at 90s.
- **No coaching** — no “good answer” bias.
- **Instant fallback** — Gemini → Groq LLaMA 3.3 on failure.

### For HR
- **Structured report** — 5 dimensions, scored with evidence quotes.
- **Verdict logic** — Hire / Hold / Pass.
- **Tone badge** — personality summary.
- **Integrity tracking** — tab switches, pauses, response timing.
- **Standouts & red flags** — auto-detected.
- **PDF export**
- **Dashboard with filters**

---

## 🛠️ Tech Stack

| Category | Technology | Purpose |
|---|---|---|
| Framework | Next.js 14 | Fullstack app |
| AI Chat | Gemini 3.1 → Groq LLaMA 3.3 | Conversation engine |
| AI Assess | Gemini 3.0 → Groq | Scoring |
| STT | Web Speech API + Groq Whisper | Speech-to-text |
| TTS | ElevenLabs | Voice output |
| DB | Supabase | Data storage |
| Email | Resend | OTP system |
| PDF | jsPDF | Report generation |
| Deploy | Vercel | Hosting |

---

## 🏗️ Architecture

```mermaid
graph TD;
    A[Client] --> B(STT)
    B --> C(API)
    C --> D(Gemini)
    C --> E(Groq)
    D --> F(TTS)
    E --> F
    F --> A
    C --> G(Assessment)
    G --> H(DB)
    H --> I(Dashboard)
````

---

## 🔒 Security

* API keys → stored in env vars
* AI calls → server-side only
* DB → Supabase RLS enabled
* OTP → expires in 10 minutes, single-use
* Public keys → only safe `NEXT_PUBLIC_` values exposed

---

## 📊 Assessment Dimensions

| Dimension      | Meaning          |
| -------------- | ---------------- |
| Communication  | Clarity          |
| Warmth         | Tone             |
| Simplification | Teaching ability |
| Fluency        | English          |
| Adaptability   | Thinking         |

**Verdict Logic:**

* Hire ≥ 4.0
* Hold 3.0–3.9
* Pass < 3.0

---

## 🧠 Key Engineering Decisions

* **Instant AI fallback** → zero waiting
* **Auto mic activation** → natural conversation
* **STT-aware scoring** → avoids unfair penalties
* **JSON repair logic** → prevents crashes
* **OTP bypass for testing** → saves API cost

---

## 💻 Local Setup

```bash
git clone https://github.com/Ishaan0977/anaya-ai-screener.git
cd anaya-ai-screener
npm install
```

Create `.env.local`:

```env
GEMINI_API_KEY=
ELEVENLABS_API_KEY=
GROQ_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Run:

```bash
npm run dev
```

---

## 🚀 Deployment

```bash
npm i -g vercel
vercel --prod
```

---

## 📂 Structure

```text
src/
├── app/
├── hooks/
├── lib/
└── types/
```

---

## 🔮 Future Improvements

* Interrupt detection
* Multilingual support
* Radar chart visualization
* HR email alerts
* Model calibration

---


