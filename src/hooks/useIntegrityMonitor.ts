'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

export type IntegritySignal = {
  tabSwitches: number;
  longPauses: number;        // responses that took > 30s to start
  fastResponses: number;     // responses that started in < 2s (copy-paste?)
  avgResponseStartMs: number;
};

export function useIntegrityMonitor(isWaiting: boolean) {
  const [signals, setSignals] = useState<IntegritySignal>({
    tabSwitches: 0,
    longPauses: 0,
    fastResponses: 0,
    avgResponseStartMs: 0,
  });

  const waitStartRef = useRef<number | null>(null);
  const responseTimes = useRef<number[]>([]);

  // Track tab visibility changes
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        setSignals(prev => ({ ...prev, tabSwitches: prev.tabSwitches + 1 }));
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Track when waiting starts
  useEffect(() => {
    if (isWaiting) {
      waitStartRef.current = Date.now();
    }
  }, [isWaiting]);

  const recordResponseStart = useCallback(() => {
    if (!waitStartRef.current) return;
    const elapsed = Date.now() - waitStartRef.current;
    responseTimes.current.push(elapsed);

    const avg = responseTimes.current.reduce((a, b) => a + b, 0) / responseTimes.current.length;

    setSignals(prev => ({
      ...prev,
      longPauses: elapsed > 30000 ? prev.longPauses + 1 : prev.longPauses,
      fastResponses: elapsed < 2000 ? prev.fastResponses + 1 : prev.fastResponses,
      avgResponseStartMs: Math.round(avg),
    }));

    waitStartRef.current = null;
  }, []);

  return { signals, recordResponseStart };
}
