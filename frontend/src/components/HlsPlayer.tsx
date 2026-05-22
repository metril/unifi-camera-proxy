import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface HlsPlayerProps {
  /** Camera id == go2rtc stream path. */
  cameraId: string;
  className?: string;
}

/**
 * Live tile backed by go2rtc HLS via hls.js. HLS is plain HTTP segments, so a
 * wall of these stays smooth and works through the /go2rtc/* reverse proxy
 * (segment URLs are relative, and auth rides on every request via xhrSetup).
 */
export default function HlsPlayer({ cameraId, className }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const token = localStorage.getItem('ui_token');
    const params = new URLSearchParams({ src: cameraId });
    if (token) params.set('token', token);
    const url = `/go2rtc/api/stream.m3u8?${params.toString()}`;

    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        // Keep latency low for a live wall; small buffers, follow the live edge.
        liveSyncDurationCount: 2,
        maxBufferLength: 6,
        backBufferLength: 0,
        // Auth every request (playlist + segments) when OIDC is enabled.
        xhrSetup: (xhr) => {
          if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        },
      });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS (no header injection; relies on no-auth or query token).
      video.src = url;
      video.play().catch(() => {});
    }

    return () => {
      if (hls) hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [cameraId]);

  return <video ref={videoRef} muted playsInline className={className} />;
}
