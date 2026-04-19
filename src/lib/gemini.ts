import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

// ── Gemini setup ──────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-3.1-flash-lite-preview',
  generationConfig: {
    temperature: 0.85,
    topP: 0.95,
    maxOutputTokens: 120,
  },
});

export const assessmentModel = genAI.getGenerativeModel({
  model: 'gemini-3-flash-preview',
  generationConfig: {
    temperature: 0.2,
    responseMimeType: 'application/json',
    maxOutputTokens: 2048,
  },
});

// ── Groq setup (fallback) ─────────────────────────────────────
const groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_CHAT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_ASSESS_MODEL = 'llama-3.3-70b-versatile';

// ── Should we fall back to Groq? ─────────────────────────────
// Catches 429 rate limits, 503 overload, 404 model not found,
// network errors, and anything else Gemini throws
function shouldFallbackToGroq(err: unknown): boolean {
  if (!(err instanceof Error)) return true; // unknown error → fallback
  const msg = err.message.toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('500') ||
    msg.includes('quota') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('service unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('not found') ||
    msg.includes('unavailable') ||
    msg.includes('timeout') ||
    msg.includes('fetch failed')
  );
}

// ── Helper: convert Gemini history → Groq/OpenAI format ──────
function convertHistoryToGroq(
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  finalInstruction: string
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [];
  for (const turn of history) {
    const content = turn.parts.map(p => p.text).join('\n');
    messages.push({
      role: turn.role === 'model' ? 'assistant' : 'user',
      content,
    });
  }
  messages.push({ role: 'user', content: finalInstruction });
  return messages;
}

// ─────────────────────────────────────────────────────────────
// CHAT: Try Gemini once → instantly fall back to Groq on ANY error
// ─────────────────────────────────────────────────────────────
export async function chatWithFallback(
  history: { role: 'user' | 'model'; parts: { text: string }[] }[],
  instruction: string
): Promise<string> {
  // Try Gemini — ONE attempt only
  try {
    const chat = geminiModel.startChat({ history });
    const result = await chat.sendMessage(instruction);
    return result.response.text().trim();
  } catch (err) {
    if (shouldFallbackToGroq(err)) {
      console.log(`Gemini failed (${err instanceof Error ? err.message.slice(0, 80) : 'unknown'}). Switching to Groq instantly...`);
    } else {
      // Something we don't want to silently swallow (e.g. bad API key config)
      throw err;
    }
  }

  // Groq fallback
  const groqMessages = convertHistoryToGroq(history, instruction);
  const response = await groqClient.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages: groqMessages,
    max_tokens: 150,
    temperature: 0.85,
  });
  const text = response.choices[0]?.message?.content?.trim() ?? '';
  console.log('Groq chat fallback succeeded.');
  return text;
}

// ─────────────────────────────────────────────────────────────
// ASSESSMENT: Try Gemini once → instantly fall back to Groq
// ─────────────────────────────────────────────────────────────
export async function assessWithFallback(prompt: string): Promise<string> {
  // Try Gemini — ONE attempt only
  try {
    const result = await assessmentModel.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    if (shouldFallbackToGroq(err)) {
      console.log(`Gemini assess failed (${err instanceof Error ? err.message.slice(0, 80) : 'unknown'}). Switching to Groq instantly...`);
    } else {
      throw err;
    }
  }

  // Groq fallback — append JSON instruction since Groq ignores responseMimeType
  const groqPrompt = prompt +
    '\n\nIMPORTANT: Return ONLY the raw JSON object. No markdown, no backticks, no explanation. Start with { and end with }.';

  const response = await groqClient.chat.completions.create({
    model: GROQ_ASSESS_MODEL,
    messages: [{ role: 'user', content: groqPrompt }],
    max_tokens: 2048,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  });

  const text = response.choices[0]?.message?.content?.trim() ?? '';
  console.log('Groq assessment fallback succeeded.');
  return text;
}

// ─────────────────────────────────────────────────────────────
// ALL EXISTING EXPORTS — unchanged
// ─────────────────────────────────────────────────────────────

export const ANAYA_SYSTEM_PROMPT = `
You are Anaya, a warm interviewer at Cuemath — India's leading math tutoring company.
You conduct short screening interviews with tutor candidates.

YOUR ROLE IS TO INTERVIEW — NOT TO COACH OR EVALUATE OUT LOUD.

ACKNOWLEDGMENT — keep it to 3-5 words max, then move on:
Good neutral phrases: "Got it.", "Makes sense.", "Okay, noted.", "Thanks for that.", "Understood." then ask the follow up or main question along with the starting phrases
NEVER say: "Great answer!", "Excellent!", "That's a great approach", "You should...", "One thing to consider..."
NEVER give feedback, advice, or suggestions.

FOLLOW-UP QUESTIONS — this is important:
If a candidate mentions something specific and interesting, ask ONE follow-up to explore it deeper before moving to the next main question.
Examples of when to follow up:
- They mention a specific technique: "You mentioned using stories — can you give me a quick example of how that worked?"
- They mention a student type: "What age group were you teaching when that happened?"  
- Their answer is vague: "Could you walk me through that a bit more specifically?"
- They say something surprising or impressive: "That's an interesting approach — how did the student respond?"

Only follow up ONCE per main question. Then move on.

MAIN QUESTIONS (4 total — generate fresh each interview):
Q1 — Their teaching background and why they work with children
Q2 — How they handle a student who is struggling or shutting down  
Q3 — Live simplification: explain a math concept RIGHT NOW as if talking to a 9-year-old
Q4 — An emotional or behavioral scenario (child crying, wrong answer despite understanding, refusal to continue)

RULES:
- ALL responses under 55 words. Voice conversation — short is better.
- Natural spoken sentences. No bullet points.
- Track which main question you're on. Max one follow-up per question.
- If answer under 12 words: probe once before moving on.
- Generate scenarios fresh each interview — vary wording and situations.

OUTPUT: Only the spoken words. Nothing else.
`;

export type Turn = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

export function buildConversationHistory(
  transcript: { role: 'anaya' | 'candidate'; text: string }[]
): Turn[] {
  return transcript.map((entry) => ({
    role: entry.role === 'anaya' ? 'model' : 'user',
    parts: [{ text: entry.text }],
  }));
}

export function buildNextTurnInstruction(
  candidateName: string,
  candidateTurns: number,
  lastCandidateText: string,
  followUpUsedForQuestion: number | null,
  currentMainQuestion: number
): string {
  const firstName = candidateName.split(' ')[0];
  const wordCount = lastCandidateText.trim().split(/\s+/).length;
  const tooShort = wordCount < 12;
  const canFollowUp = followUpUsedForQuestion !== currentMainQuestion;

  if (tooShort && canFollowUp && candidateTurns > 0 && currentMainQuestion <= 4) {
    return `${firstName} gave a very brief answer: "${lastCandidateText}".
Ask them to elaborate more specifically. Vary your wording each time. Under 20 words. Do NOT move to the next main question yet.`;
  }

  const interestingAnswer =
    lastCandidateText.length > 80 &&
    canFollowUp &&
    currentMainQuestion > 0 &&
    currentMainQuestion < 4;

  if (interestingAnswer && currentMainQuestion >= 1 && currentMainQuestion <= 2) {
    return `${firstName} said: "${lastCandidateText.slice(0, 200)}".
They mentioned something specific. Ask ONE natural follow-up question that digs deeper into what they said — reference their actual words. Make it feel conversational, not interrogative. Under 30 words. Do NOT move to the next main question yet.`;
  }

  switch (currentMainQuestion) {
    case 0:
      return `Ask Q1 — a warm, fresh question about ${firstName}'s teaching background and what draws them to children. Generate it freshly each time. Under 35 words.`;

    case 1:
      return `In a single response, give a brief 3-word neutral acknowledgment of what ${firstName} said, and immediately ask Q2: a specific vivid scenario where a student is struggling or shutting down. Make it concrete and fresh. Total under 55 words.`;

    case 2:
      return `In a single response, give a brief 3-word neutral acknowledgment, and immediately ask Q3: tell ${firstName} to explain a math concept RIGHT NOW as if you are a 9-year-old. Pick a concept (fractions, decimals, negative numbers, multiplication, place value). Say something like "Okay, I'm your student now — go ahead." Under 55 words.`;

    case 3:
      return `In a single response, give a brief 3-word neutral acknowledgment, and immediately ask Q4: a fresh emotional or behavioral scenario, different from Q2. Options: child cries from frustration, says they understand but gets it wrong, refuses to continue, parent interrupts aggressively. Pick one and make it vivid. Under 55 words.`;

    case 4:
      return `Interview complete. Thank ${firstName} warmly by name. Tell them Cuemath's team will be in touch within 2 business days. Genuine, brief, no feedback on answers. Under 40 words.`;

    default:
      return `Wrap up warmly in one sentence.`;
  }
}

export function buildAssessmentPrompt(
  candidateName: string,
  candidateAnswers: string[]
): string {
  const answers = candidateAnswers
    .map((a, i) => `A${i + 1}: ${a.slice(0, 300)}`)
    .join('\n');

  return `Evaluate tutor candidate ${candidateName} for Cuemath.

ANSWERS:
${answers}

Return ONLY valid JSON, no markdown, no extra text:
{"verdict":"Hold","verdict_reason":"Brief reason under 60 chars","overall_score":3.2,"tone_badge":"Empathetic","tone_description":"Speaks with warmth and genuine care for students","scores":[{"dimension":"Communication Clarity","score":3,"evidence_quote":"short quote max 50 chars","notes":"one sentence max 80 chars"},{"dimension":"Warmth & Patience","score":3,"evidence_quote":"short quote max 50 chars","notes":"one sentence max 80 chars"},{"dimension":"Ability to Simplify","score":3,"evidence_quote":"short quote max 50 chars","notes":"one sentence max 80 chars"},{"dimension":"English Fluency","score":3,"evidence_quote":"short quote max 50 chars","notes":"one sentence max 80 chars"},{"dimension":"Adaptability","score":3,"evidence_quote":"short quote max 50 chars","notes":"one sentence max 80 chars"}],"red_flags":["concern if any"],"standout_moments":["best moment"]}

SCORING 1-5: 5=Exceptional 4=Strong 3=Adequate 2=Weak 1=Poor
VERDICT: Hire>=4.0 no dim<3 | Hold=3.0-3.9 or one dim<3 | Pass<3.0 or two+ dims<3
tone_badge: Pick ONE word from: Empathetic, Structured, Enthusiastic, Reserved, Analytical, Nurturing, Confident, Methodical
tone_description: One sentence, max 60 chars
Replace all placeholder values with real ones. Keep all strings SHORT.`;
}
