import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { assessmentModel, buildAssessmentPrompt } from '@/lib/gemini';

type DimensionScoreRaw = {
  dimension: string;
  score: number;
  evidence_quote: string;
  notes: string;
};

// Retry with exponential backoff — handles 429 quota errors gracefully
async function generateWithRetry(prompt: string, maxRetries = 3): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await assessmentModel.generateContent(prompt);
      return result.response.text().trim();
    } catch (err: unknown) {
      const isQuota =
        err instanceof Error &&
        (err.message.includes('429') || err.message.includes('quota') || err.message.includes('Too Many Requests'));

      if (isQuota && attempt < maxRetries - 1) {
        const waitMs = (attempt + 1) * 20000; // 20s, 40s, 60s
        console.log(`Rate limited. Retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

export async function POST(req: NextRequest) {
  const { session_id } = await req.json();
  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }

  try {
    const { data: session, error: sErr } = await supabaseAdmin
      .from('sessions')
      .select('candidate_name')
      .eq('id', session_id)
      .single();

    if (sErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { data: transcript } = await supabaseAdmin
      .from('transcript_entries')
      .select('role, text')
      .eq('session_id', session_id)
      .order('turn_index', { ascending: true });

    const candidateAnswers = (transcript ?? [])
      .filter(t => t.role === 'candidate')
      .map(t => t.text);

    if (candidateAnswers.length < 2) {
      return NextResponse.json({ error: 'Not enough responses to assess' }, { status: 400 });
    }

    const prompt = buildAssessmentPrompt(session.candidate_name, candidateAnswers);

    let rawText: string;
    try {
      rawText = await generateWithRetry(prompt);
    } catch (retryErr) {
      console.error('All retries failed:', retryErr);
      // Save fallback and still complete the session
      const fallback = buildFallbackAssessment(candidateAnswers.length);
      await saveAssessment(session_id, fallback);
      return NextResponse.json({ success: true, assessment: fallback, fallback: true });
    }

    // Extract JSON
    let jsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const startIdx = jsonText.indexOf('{');
    const endIdx = jsonText.lastIndexOf('}');

    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      console.error('No valid JSON boundaries found:', jsonText.slice(0, 300));
      const fallback = buildFallbackAssessment(candidateAnswers.length);
      await saveAssessment(session_id, fallback);
      return NextResponse.json({ success: true, assessment: fallback, fallback: true });
    }

    jsonText = jsonText.slice(startIdx, endIdx + 1);

    let assessment;
    try {
      assessment = JSON.parse(jsonText);
    } catch {
      console.error('JSON parse failed:', jsonText.slice(0, 400));
      assessment = buildFallbackAssessment(candidateAnswers.length);
    }

    if (!assessment.verdict || !Array.isArray(assessment.scores)) {
      assessment = buildFallbackAssessment(candidateAnswers.length);
    }

    await saveAssessment(session_id, assessment);
    return NextResponse.json({ success: true, assessment });

  } catch (err) {
    console.error('Assessment error:', err);
    return NextResponse.json({ error: 'Failed to generate assessment' }, { status: 500 });
  }
}

async function saveAssessment(session_id: string, assessment: {
  verdict: string;
  verdict_reason: string;
  overall_score: number;
  red_flags: string[];
  standout_moments: string[];
  scores: DimensionScoreRaw[];
}) {
  const { data: assessmentRow, error: aErr } = await supabaseAdmin
    .from('assessments')
    .insert({
      session_id,
      verdict: assessment.verdict,
      verdict_reason: assessment.verdict_reason ?? 'Assessment completed.',
      overall_score: assessment.overall_score ?? 3.0,
      red_flags: assessment.red_flags ?? [],
      standout_moments: assessment.standout_moments ?? [],
    })
    .select('id')
    .single();

  if (aErr) throw aErr;

  const dimensionRows = (assessment.scores as DimensionScoreRaw[]).map(s => ({
    assessment_id: assessmentRow.id,
    session_id,
    dimension: s.dimension,
    score: s.score,
    evidence_quote: s.evidence_quote ?? '',
    notes: s.notes ?? '',
  }));

  await supabaseAdmin.from('dimension_scores').insert(dimensionRows);

  await supabaseAdmin
    .from('sessions')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .eq('id', session_id);
}

function buildFallbackAssessment(answerCount: number) {
  const score = answerCount >= 4 ? 3 : 2;
  return {
    verdict: score >= 3 ? 'Hold' : 'Pass',
    verdict_reason: 'Manual review recommended — automated scoring was unavailable.',
    overall_score: score,
    scores: [
      'Communication Clarity',
      'Warmth & Patience',
      'Ability to Simplify',
      'English Fluency',
      'Adaptability',
    ].map(dimension => ({
      dimension,
      score,
      evidence_quote: 'See transcript for context.',
      notes: 'Manual review recommended.',
    })),
    red_flags: ['Automated assessment incomplete — manual review required'],
    standout_moments: ['Candidate completed the screening interview'],
  };
}
