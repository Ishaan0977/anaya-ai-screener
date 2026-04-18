import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audioFile = formData.get('audio') as File;

  if (!audioFile) {
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
  }

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-large-v3',
      language: 'en',
      response_format: 'json',
    });

    return NextResponse.json({ text: transcription.text });
  } catch (err) {
    console.error('Groq transcription error:', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
