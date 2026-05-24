import { useEffect, useRef, useState } from 'react';

interface Options {
  url: string | null;
  enabled?: boolean;
  onMessage: (event: MessageEvent) => void;
  onOpen?: () => void;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export function useReconnectingWs({
  url,
  enabled = true,
  onMessage,
  onOpen,
  initialDelayMs = 1000,
  maxDelayMs = 30000,
}: Options): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    if (!enabled || !url) {
      setConnected(false);
      return;
    }

    let delay = initialDelayMs;
    let intentionalClose = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let ws: WebSocket | null = null;

    const connect = () => {
      ws = new WebSocket(url);
      ws.onopen = () => {
        setConnected(true);
        delay = initialDelayMs;
        onOpenRef.current?.();
      };
      ws.onmessage = (e) => onMessageRef.current(e);
      ws.onerror = () => setConnected(false);
      ws.onclose = () => {
        setConnected(false);
        if (intentionalClose) return;
        reconnectTimer = setTimeout(() => {
          delay = Math.min(delay * 2, maxDelayMs);
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      intentionalClose = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
      ws = null;
      setConnected(false);
    };
  }, [url, enabled, initialDelayMs, maxDelayMs]);

  return { connected };
}
