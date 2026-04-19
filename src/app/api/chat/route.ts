import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  ANAYA_SYSTEM_PROMPT,
  buildConversationHistory,
  buildNextTurnInstruction,
  chatWithFallback,
} from '@/lib/gemini';

function getCurrentMainQuestion(candidateTurns: number, followUpCount: number): number {
  return candidateTurns - followUpCount;
}

export async function POST(req: NextRequest) {
  const {
    session_id,
    candidate_name,
    transcript,
    turn_index,
    follow_up_count = 0,
    follow_up_used_for = null,
  } = await req.json();

  if (!session_id || !candidate_name) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  try {
    // ── Turn 0: static welcome, no LLM needed ──
    if (turn_index === 0) {
      const opening = `Hi there! I'm Anaya from Cuemath's talent team — thanks for making time today. This will be a relaxed ten-minute conversation to get to know you better. No trick questions — just be yourself. Shall we begin?`;
      await supabaseAdmin.from('transcript_entries').insert({
        session_id, role: 'anaya', text: opening,
        turn_index: 0, timestamp_ms: Date.now(),
      });
      return NextResponse.json({
        text: opening, next_turn: 1, interview_complete: false,
        question_number: 0, total_questions: 4,
        follow_up_count: 0, follow_up_used_for: null,
      });
    }

    const candidateTurns = transcript.filter(
      (t: { role: string }) => t.role === 'candidate'
    ).length;

    const lastCandidateText = [...transcript]
      .reverse()
      .find((t: { role: string }) => t.role === 'candidate')?.text ?? '';

    const currentMainQuestion = getCurrentMainQuestion(candidateTurns, follow_up_count);

    if (currentMainQuestion >= 5) {
      await supabaseAdmin
        .from('sessions')
        .update({ status: 'completed', ended_at: new Date().toISOString() })
        .eq('id', session_id);
      return NextResponse.json({
        text: '', interview_complete: true,
        next_turn: turn_index + 1,
        question_number: 4, total_questions: 4,
        follow_up_count, follow_up_used_for,
      });
    }

    const instruction = buildNextTurnInstruction(
      candidate_name, candidateTurns, lastCandidateText,
      follow_up_used_for, currentMainQuestion
    );

    const isFollowUpInstruction =
      instruction.includes('Do NOT move to the next main question yet') ||
      instruction.includes('elaborate');

    const conversationHistory = buildConversationHistory(
      transcript.filter((_: unknown, i: number) => i > 0)
    );

    const history = [
      { role: 'user' as const, parts: [{ text: ANAYA_SYSTEM_PROMPT }] },
      { role: 'model' as const, parts: [{ text: `Understood. I'm Anaya. Short acknowledgments, genuine follow-ups, no coaching.` }] },
      ...conversationHistory,
    ];

    // Gemini with automatic Groq fallback
    const anayaResponse = await chatWithFallback(history, instruction);

    await supabaseAdmin.from('transcript_entries').insert({
      session_id, role: 'anaya', text: anayaResponse,
      turn_index, timestamp_ms: Date.now(),
    });

    const newFollowUpCount = isFollowUpInstruction ? follow_up_count + 1 : follow_up_count;
    const newFollowUpUsedFor = isFollowUpInstruction ? currentMainQuestion : follow_up_used_for;
    const isClosing = currentMainQuestion === 4;
    const questionNumber = Math.min(Math.max(currentMainQuestion, 1), 4);

    return NextResponse.json({
      text: anayaResponse,
      next_turn: turn_index + 1,
      interview_complete: isClosing,
      question_number: questionNumber,
      total_questions: 4,
      follow_up_count: newFollowUpCount,
      follow_up_used_for: newFollowUpUsedFor,
    });

  } catch (err) {
    console.error('Chat error:', err);
    return NextResponse.json({ error: 'Anaya encountered an error' }, { status: 500 });
  }
}
