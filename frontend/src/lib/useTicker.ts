import { useEffect, useState } from 'react';
import { useDocumentVisible } from './useDocumentVisible';

export function useTicker(intervalMs: number): number {
  const visible = useDocumentVisible();
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!visible) return;
    setTick(Date.now());
    const id = setInterval(() => setTick(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, visible]);
  return tick;
}
