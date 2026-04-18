import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Chat model
export const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  generationConfig: {
    temperature: 0.85,
    topP: 0.95,
    maxOutputTokens: 120,
  },
});

// Assessment model
export const assessmentModel = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  generationConfig: {
    temperature: 0.2,
    maxOutputTokens: 900,
  },
});

export const ANAYA_SYSTEM_PROMPT = `
You are Anaya, a warm interviewer at Cuemath — India's leading math tutoring company.
You conduct short screening interviews with tutor candidates.

YOUR ROLE IS TO INTERVIEW — NOT TO COACH OR EVALUATE OUT LOUD.

ACKNOWLEDGMENT — keep it to 3-5 words max, then move on:
Good neutral phrases: "Got it.", "Makes sense.", "Okay, noted.", "Thanks for that.", "Understood."
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

// Detect if last answer warrants a follow-up
function shouldFollowUp(text: string): boolean {
  const wordCount = text.trim().split(/\s+/).length;
  // Too short — definitely probe
  if (wordCount < 12) return true;
  return false;
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

  // If we haven't used our follow-up for this main question yet
  const canFollowUp = followUpUsedForQuestion !== currentMainQuestion;

  // Always probe if too short and we can follow up
  if (tooShort && canFollowUp && candidateTurns > 0 && currentMainQuestion <= 4) {
    return `${firstName} gave a very brief answer: "${lastCandidateText}".
Ask them to elaborate more specifically. Vary your wording each time. Under 20 words. Do NOT move to the next main question yet.`;
  }

  // For Q1, Q2, Q4 answers — check if follow-up is warranted by content
  const interestingAnswer = lastCandidateText.length > 80 &&
    canFollowUp &&
    currentMainQuestion > 0 &&
    currentMainQuestion < 4; // Don't follow up after simplification or closing

  if (interestingAnswer && currentMainQuestion >= 1 && currentMainQuestion <= 2) {
    return `${firstName} said: "${lastCandidateText.slice(0, 200)}".
They mentioned something specific. Ask ONE natural follow-up question that digs deeper into what they said — reference their actual words. Make it feel conversational, not interrogative. Under 30 words. Do NOT move to the next main question yet.`;
  }

  // Move to next main question
  switch (currentMainQuestion) {
    case 0:
      return `Ask Q1 — a warm, fresh question about ${firstName}'s teaching background and what draws them to children. Generate it freshly each time. Under 35 words.`;

    case 1:
      return `Give a 3-word neutral acknowledgment of what ${firstName} said. Then immediately ask Q2 — a specific vivid scenario: a student is struggling or shutting down. Make it concrete and fresh. Total under 55 words.`;

    case 2:
      return `Give a 3-word neutral acknowledgment. Then ask Q3 — tell ${firstName} to explain a math concept RIGHT NOW as if you are a 9-year-old. Pick a concept (fractions, decimals, negative numbers, multiplication, place value — vary it). Say something like "Okay, I'm your student now — go ahead." Under 55 words.`;

    case 3:
      return `Give a 3-word neutral acknowledgment. Then ask Q4 — a fresh emotional or behavioral scenario, different from Q2. Options: child cries from frustration, says they understand but gets it wrong, refuses to continue, parent interrupts aggressively. Pick one and make it vivid. Under 55 words.`;

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
    .map((a, i) => `A${i + 1}: ${a.slice(0, 300)}`) // Cap each answer to save tokens
    .join('\n');

  return `Evaluate tutor candidate ${candidateName} for Cuemath.

ANSWERS:
${answers}

Return ONLY valid JSON, no markdown, no extra text:
{"verdict":"Hold","verdict_reason":"Brief reason under 60 chars","overall_score":3.2,"scores":[{"dimension":"Communication Clarity","score":3,"evidence_quote":"short quote max 50 chars","notes":"one sentence max 80 chars"},{"dimension":"Warmth & Patience","score":3,"evidence_quote":"short quote max 50 chars","notes":"one sentence max 80 chars"},{"dimension":"Ability to Simplify","score":3,"evidence_quote":"short quote max 50 chars","notes":"one sentence max 80 chars"},{"dimension":"English Fluency","score":3,"evidence_quote":"short quote max 50 chars","notes":"one sentence max 80 chars"},{"dimension":"Adaptability","score":3,"evidence_quote":"short quote max 50 chars","notes":"one sentence max 80 chars"}],"red_flags":["concern if any"],"standout_moments":["best moment"]}

SCORING 1-5: 5=Exceptional 4=Strong 3=Adequate 2=Weak 1=Poor
VERDICT: Hire>=4.0 no dim<3 | Hold=3.0-3.9 or one dim<3 | Pass<3.0 or two+ dims<3
Replace placeholder values with real ones. Keep all strings SHORT.`;
}
