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
 * Live preview tile backed by go2rtc. Connects to the proxied signaling
 * WebSocket (`/go2rtc/api/ws`) and plays WebRTC with MSE/HLS/MJPEG fallback, so
 * it works through the reverse proxy even without the WebRTC UDP port exposed.
 */
export default function CameraVideo({ cameraId, className }: CameraVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureDefined();
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement('video-stream') as VideoRTC;
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
