import { useEffect, useRef } from 'react';
import { VideoRTC } from '@/vendor/video-rtc.js';

// Register the custom element exactly once for the whole app.
function ensureDefined() {
  if (!customElements.get('video-stream')) {
    customElements.define('video-stream', VideoRTC);
  }
}

interface CameraVideoProps {
  /** Camera id — also the go2rtc stream path name. */
  cameraId: string;
  className?: string;
}

/**
 * Live tile backed by go2rtc MSE (fragmented MP4 over the proxied WebSocket).
 *
 * MSE — not WebRTC, not HLS — is the transport that actually works here:
 * WebRTC can't traverse the /go2rtc/* reverse proxy (its UDP port isn't
 * exposed) so it just thrashes, and go2rtc's HLS sessions 404 behind a proxy.
 * MSE rides the single proxied WS we already handle and is cheap enough to run
 * a wall of tiles (one fMP4 decoder each, like UniFi Protect).
 */
export default function CameraVideo({ cameraId, className }: CameraVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureDefined();
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement('video-stream') as VideoRTC;
    // MSE only — see component docstring for why WebRTC/HLS are excluded.
    el.mode = 'mse';
    // Only stream while the tile is on screen and the tab is visible.
    el.background = false;
    el.visibilityThreshold = 0.5;
    el.visibilityCheck = true;
    el.style.width = '100%';
    el.style.height = '100%';

    const token = localStorage.getItem('ui_token');
    const params = new URLSearchParams({ src: cameraId });
    if (token) params.set('token', token);
    // Setting `src` is what kicks off the connection once mounted in the DOM.
    el.src = `/go2rtc/api/ws?${params.toString()}`;

    container.appendChild(el);
    return () => {
      el.remove();
    };
  }, [cameraId]);

  return <div ref={containerRef} className={className} />;
}
