import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface HlsPlayerProps {
  /** Camera id — also the go2rtc stream path name. */
  cameraId: string;
  className?: string;
  /** Reports the decoded video resolution once known (for HUD overlays). */
  onMeta?: (meta: { width: number; height: number }) => void;
}

/**
 * Live wall tile backed by go2rtc HLS via hls.js.
 *
 * HLS is the right transport for a many-tile wall: plain HTTP segments that go
 * cleanly through the /go2rtc/* reverse proxy and scale far better than a wall
 * of WebRTC peers. It is NOT used for the click-to-expand close-up — that uses
 * WebRTC (with MSE fallback) for sub-second latency; see CameraVideo.tsx.
 *
 * Two go2rtc-specific facts shape this component:
 *  - go2rtc's HLS session has a 5s keepalive that is reset ONLY by segment
 *    fetches. A normally-playing hls.js (0.5s segments) keeps it alive; the
 *    danger is re-fetching the master playlist, which mints a NEW session id and
 *    leaves the old one to 404 — the "changing id" loop. So on errors we recover
 *    with startLoad()/recoverMediaError() and NEVER call loadSource() again.
 *  - The master playlist's sub-URLs are relative and drop the ?token= query, so
 *    auth (when OIDC is on) must ride the Authorization header on every request,
 *    which only hls.js (via xhrSetup) can do — hence we never use native HLS.
 */
export default function HlsPlayer({ cameraId, className, onMeta }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !Hls.isSupported()) return;
    const onLoaded = () => {
      if (onMeta && video.videoWidth) {
        onMeta({ width: video.videoWidth, height: video.videoHeight });
      }
    };
    video.addEventListener('loadedmetadata', onLoaded);

    const token = localStorage.getItem('ui_token');
    // fMP4 (&mp4) so H265 cameras work too; bare stream.m3u8 is H264-only TS.
    const src = `/go2rtc/api/stream.m3u8?src=${encodeURIComponent(cameraId)}&mp4`;

    const hls = new Hls({
      enableWorker: true, // demux/remux off the main thread — keeps the UI smooth
      lowLatencyMode: false, // go2rtc serves plain HLS, not LL-HLS
      backBufferLength: 0,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 5,
      maxLiveSyncPlaybackRate: 1.25, // gentle, capped catch-up (no speed-jerk)
      // Auth on every request (playlist + segments) when OIDC is enabled. The
      // relative sub-URLs carry no token, so the header is the only way through.
      xhrSetup: (xhr) => {
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      },
    });

    let attempts = 0;
    const MAX_ATTEMPTS = 5;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    hls.on(Hls.Events.ERROR, (_evt, data) => {
      if (!data.fatal) return;
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          if (attempts < MAX_ATTEMPTS) {
            const delay = Math.min(1000 * 2 ** attempts, 16000);
            attempts += 1;
            // startLoad() retries the SAME session; loadSource() would mint a
            // new one and trigger the 404 loop, so we never call it here.
            retryTimer = setTimeout(() => hls.startLoad(), delay);
          } else {
            hls.destroy();
          }
          break;
        case Hls.ErrorTypes.MEDIA_ERROR:
          if (attempts < MAX_ATTEMPTS) {
            attempts += 1;
            hls.recoverMediaError();
          } else {
            hls.destroy();
          }
          break;
        default:
          hls.destroy();
      }
    });

    const resetAttempts = () => {
      attempts = 0;
    };
    hls.on(Hls.Events.MANIFEST_LOADED, resetAttempts);
    hls.on(Hls.Events.BUFFER_APPENDING, resetAttempts);

    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));

    // Only decode tiles that are actually on screen / in a visible tab.
    const stop = () => hls.stopLoad();
    const start = () => hls.startLoad();
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);

    let observer: IntersectionObserver | undefined;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
        { threshold: 0.25 },
      );
      observer.observe(video);
    }

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      observer?.disconnect();
      video.removeEventListener('loadedmetadata', onLoaded);
      hls.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [cameraId, onMeta]);

  return <video ref={videoRef} muted playsInline className={className} />;
}
