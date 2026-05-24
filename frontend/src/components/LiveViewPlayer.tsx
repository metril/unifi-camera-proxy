import { useEffect, useRef, useState } from 'react';
import type { LiveView } from '../types';
import HlsPlayer from './HlsPlayer';
import { fitCanvas, tileRect } from '@/lib/liveViewLayout';

interface LiveViewPlayerProps {
  viewId: string;
  /** From the URL ``?token=…`` query string; null when the operator is
   *  in an OIDC session and pulling up the view from the dashboard. */
  kioskToken: string | null;
}

/**
 * Fullscreen Live View renderer for any browser/TV/kiosk display.
 *
 * - No AppShell, no sidebar, no header — just the canvas, letterboxed
 *   into the viewport so a layout authored at e.g. 1920×1080 scales
 *   identically on a 4K display.
 * - Each tile pulls live video through the existing HlsPlayer pipeline
 *   (HLS with hls.js, IntersectionObserver-paused when hidden).
 * - Cursor hides after 3 s of inactivity for an unattended display feel.
 * - On any 401 the page surfaces a clear message: either the kiosk token
 *   was revoked, or this browser doesn't have a logged-in session.
 */
export default function LiveViewPlayer({ viewId, kioskToken }: LiveViewPlayerProps) {
  const [view, setView] = useState<LiveView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const idleTimer = useRef<number | null>(null);

  // Fetch manifest. Auth: kiosk-token via ?token=… (handled server-side by
  // auth_middleware), or fall through to the OIDC session token stashed in
  // localStorage by the main shell. Plain Bearer header in both cases.
  useEffect(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const url = new URL(`/api/live-views/${viewId}`, window.location.origin);
    if (kioskToken) {
      url.searchParams.set('token', kioskToken);
    } else {
      const sessionToken = localStorage.getItem('ui_token');
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
    }
    fetch(url.toString(), { headers })
      .then((r) => {
        if (r.status === 401) throw new Error('Unauthorized');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setView)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [viewId, kioskToken]);

  // Aspect-fit canvas into viewport.
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Hide cursor after 3 s idle.
  useEffect(() => {
    const reset = () => {
      setCursorHidden(false);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setCursorHidden(true), 3000);
    };
    reset();
    window.addEventListener('mousemove', reset);
    window.addEventListener('keydown', reset);
    return () => {
      window.removeEventListener('mousemove', reset);
      window.removeEventListener('keydown', reset);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
    };
  }, []);

  if (error) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-black text-foreground">
        <div className="max-w-md text-center space-y-3 p-6">
          <div className="label-eyebrow text-destructive">live view</div>
          <h1 className="text-2xl">Can't load this Live View</h1>
          <p className="text-sm text-muted-foreground">
            {error === 'Unauthorized'
              ? 'The kiosk URL is invalid or has been revoked. Ask the operator to mint a new one.'
              : error}
          </p>
        </div>
      </div>
    );
  }

  if (!view) {
    return <div className="fixed inset-0 bg-black" />;
  }

  const { canvas, tiles } = view;
  const fit = fitCanvas(canvas, viewport);

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden"
      style={{ cursor: cursorHidden ? 'none' : 'auto' }}
    >
      <div
        className="absolute"
        style={{ left: fit.offsetX, top: fit.offsetY, width: fit.width, height: fit.height }}
      >
        {tiles.map((t, i) => {
          const rect = tileRect(t, fit.scale);
          return (
            <div key={i} className="absolute overflow-hidden" style={rect}>
              <HlsPlayer
                cameraId={t.camera_id}
                className="w-full h-full object-cover"
                authToken={kioskToken}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
