import { useEffect, useRef, useState } from 'react';
import { Cctv, Link2, AlertTriangle } from 'lucide-react';
import { api, snapshotUrl } from '../../api';
import type { GridFusionTile } from '../../types';

/** Live snapshot for a GridFusion tile: existing cameras use the snapshot
 *  endpoint; raw URLs are grabbed once via /api/preview-frame. Refreshes slowly
 *  so a wall of tiles doesn't hammer the cameras. */
export default function TilePreview({ tile }: { tile: GridFusionTile }) {
  const [bust, setBust] = useState(() => Date.now());
  const [urlSrc, setUrlSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const objectUrl = useRef<string | null>(null);

  // Existing-camera tiles: cache-busted snapshot endpoint.
  useEffect(() => {
    if (!tile.source) return;
    const t = setInterval(() => setBust(Date.now()), 5000);
    return () => clearInterval(t);
  }, [tile.source]);

  // Raw-URL tiles: fetch a frame via the backend and show it.
  useEffect(() => {
    if (!tile.url) return;
    let cancelled = false;
    const load = () => {
      api
        .previewFrame(tile.url!)
        .then((blob) => {
          if (cancelled) return;
          if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
          objectUrl.current = URL.createObjectURL(blob);
          setUrlSrc(objectUrl.current);
          setError(false);
        })
        .catch(() => !cancelled && setError(true));
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, [tile.url]);

  const src = tile.source ? snapshotUrl(tile.source, bust) : urlSrc;

  return (
    <div className="absolute inset-0 bg-black overflow-hidden">
      {src && !error ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setError(true)}
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground/60">
          {error ? (
            <AlertTriangle className="w-5 h-5 text-amber-500/70" />
          ) : tile.url ? (
            <Link2 className="w-5 h-5" />
          ) : (
            <Cctv className="w-5 h-5" />
          )}
        </div>
      )}
    </div>
  );
}
