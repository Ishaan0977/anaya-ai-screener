'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

// Browser Speech API type declarations for TypeScript
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface UseSpeechRecognitionReturn {
  transcript: string;
  isListening: boolean;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => Promise<string>;
  resetTranscript: () => void;
  error: string | null;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const finalTranscriptRef = useRef('');

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }
    };
  }, []);

  const startListening = useCallback(() => {
    setError(null);
    setTranscript('');
    finalTranscriptRef.current = '';
    audioChunksRef.current = [];

    // Start MediaRecorder for Groq fallback
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.start(100);
    }).catch(() => {
      setError('Microphone access denied');
    });

    if (isSupported) {
      const SpeechRecognitionClass =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionClass();
      recognitionRef.current = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += text;
          else interim += text;
        }
        finalTranscriptRef.current += final;
        setTranscript(finalTranscriptRef.current + interim);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== 'no-speech') setError(`Speech error: ${event.error}`);
      };

      recognition.start();
    }

    setIsListening(true);
  }, [isSupported]);

  const stopListening = useCallback(async (): Promise<string> => {
    setIsListening(false);
    recognitionRef.current?.stop();

    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = async () => {
          const webSpeechResult = finalTranscriptRef.current.trim();
          if (webSpeechResult.length > 5) { resolve(webSpeechResult); return; }

          // Groq fallback
          try {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
            const data = await res.json();
            resolve(data.text ?? '');
          } catch {
            resolve(webSpeechResult);
          }
        };
        recorder.stop();
      } else {
        resolve(finalTranscriptRef.current.trim());
      }
    });
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    finalTranscriptRef.current = '';
  }, []);

  return { transcript, isListening, isSupported, startListening, stopListening, resetTranscript, error };
}
