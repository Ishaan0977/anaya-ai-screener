export type InterviewSession = {
  id: string;
  candidate_name: string;
  candidate_email: string;
  started_at: string;
  ended_at?: string;
  transcript: TranscriptEntry[];
  assessment?: Assessment;
  status: 'in_progress' | 'completed';
};

export type TranscriptEntry = {
  role: 'aria' | 'candidate';
  text: string;
  timestamp: number;
};

export type Assessment = {
  verdict: 'Hire' | 'Hold' | 'Pass';
  verdict_reason: string;
  scores: DimensionScore[];
  red_flags: string[];
  standout_moments: string[];
  overall_score: number;
};

export type DimensionScore = {
  dimension: 'Communication Clarity' | 'Warmth & Patience' | 'Ability to Simplify' | 'English Fluency' | 'Adaptability';
  score: number; // 1-5
  evidence_quote: string;
  notes: string;
};

export type InterviewQuestion = {
  id: string;
  text: string;
  type: 'opening' | 'scenario' | 'followup' | 'closing';
};
