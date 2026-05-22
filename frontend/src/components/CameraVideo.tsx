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
 * Single low-latency close-up player (the click-to-expand view from the Live
 * Wall — NOT the wall tiles, which use HLS via HlsPlayer).
 *
 * Transport is `webrtc,mse`: the vendored player tries WebRTC first for
 * sub-second latency (media is direct peer-to-peer to go2rtc's port 8555; only
 * signaling rides the proxied WS), and transparently falls back to MSE
 * (fragmented MP4 over that same WS) when the WebRTC port isn't reachable —
 * e.g. when the operator hasn't forwarded 8555 / set a candidate. HLS is not
 * used here because its latency is too high for a close-up.
 */
export default function CameraVideo({ cameraId, className }: CameraVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureDefined();
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement('video-stream') as VideoRTC;
    // WebRTC first (sub-second), MSE fallback — see component docstring.
    el.mode = 'webrtc,mse';
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
