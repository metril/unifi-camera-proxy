import { useEffect, useRef, useState } from 'react';
import { useDocumentVisible } from './useDocumentVisible';

/**
 * Sample a value at a fixed interval into a fixed-size ring buffer.
 *
 * Used by the sidebar's "running-count over the last 5 minutes"
 * sparkline. The returned array is in chronological order
 * (oldest → newest); slots are seeded with the current value on mount so
 * the sparkline draws from frame one rather than waiting for the buffer
 * to fill. Auto-pauses when the document is hidden so a backgrounded
 * dashboard doesn't keep sampling.
 */
export function useRingBuffer(value: number, capacity: number, intervalMs: number): number[] {
  const visible = useDocumentVisible();
  const [samples, setSamples] = useState<number[]>(() => Array(capacity).fill(value));
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      setSamples((prev) => {
        const next = prev.slice(1);
        next.push(valueRef.current);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, visible]);

  return samples;
}
