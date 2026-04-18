# Anaya — AI Tutor Screener 

> A voice-first AI interviewer that screens tutor candidates end-to-end. No human interviewer needed.


---

## What it does

Anaya is an AI interviewer that conducts a natural 10-minute voice conversation with tutor candidates, evaluates their soft skills, and generates a structured assessment report — all without any human involvement.

**Candidate flow:**
1. Lands on a warm onboarding screen, enters name and email
2. Has a live voice conversation with Anaya (4 questions + adaptive follow-ups)
3. Sees an instant assessment report with scores, evidence quotes, and verdict
4. HR gets a one-click downloadable PDF report

---

## Features

- 🎙️ **Voice-first** — Web Speech API (primary) + Groq Whisper (fallback)
- 🤖 **Adaptive AI** — Gemini generates fresh questions each interview, follows up on interesting answers, probes vague ones
- 🔊 **Natural voice** — ElevenLabs TTS gives Anaya a warm, human-sounding voice
- 📊 **Structured assessment** — 5 dimensions scored 1–5 with verbatim evidence quotes
- 📄 **PDF export** — downloadable report formatted for HR to forward directly
- 🗂️ **HR dashboard** — all interviews in one view, filterable by verdict
- ⚡ **Retry logic** — automatic backoff on API rate limits, fallback assessment if scoring fails

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| AI — Conversation | Google Gemini 2.5 Flash |
| AI — Assessment | Google Gemini 2.5 Pro |
| Voice — STT | Web Speech API + Groq Whisper |
| Voice — TTS | ElevenLabs |
| Database | Supabase (PostgreSQL) |
| PDF | jsPDF + jsPDF-AutoTable |
| Deployment | Vercel |

---

## Architecture

Everything lives in one Next.js project. API routes handle all server-side logic — no separate backend.
