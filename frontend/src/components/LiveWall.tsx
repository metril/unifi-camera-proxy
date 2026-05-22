import { useRef, useState } from 'react';
import { MonitorPlay, Maximize2 } from 'lucide-react';
import type { CameraStatus } from '../types';
import HlsPlayer from './HlsPlayer';
import CameraVideo from './CameraVideo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const COLS = [1, 2, 3, 4];

function Tile({ camera }: { camera: CameraStatus }) {
  const tileRef = useRef<HTMLDivElement>(null);

  const goFullscreen = () => {
    const el = tileRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  return (
    <div
      ref={tileRef}
      className="relative aspect-video bg-black rounded-lg overflow-hidden border border-border ring-1 ring-primary/10 group"
    >
      <HlsPlayer cameraId={camera.id} className="w-full h-full object-contain" />
      {/* Native fullscreen of the same HLS stream — no extra connection. */}
      <button
        type="button"
        onClick={goFullscreen}
        title="Fullscreen"
        className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-black/50 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70 hover:text-white"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
      <div className="absolute bottom-0 inset-x-0 px-3 py-1.5 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-signal" />
          <span className="text-xs text-white/90 truncate">{camera.config.name}</span>
        </div>
      </div>
    </div>
  );
}

export default function LiveWall({ cameras }: { cameras: CameraStatus[] }) {
  const [cols, setCols] = useState(2);
  const [expanded, setExpanded] = useState<CameraStatus | null>(null);
  const running = cameras.filter((c) => c.status === 'running');

  if (running.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-muted-foreground">
        <MonitorPlay className="w-12 h-12 mb-4 opacity-30" />
        <p className="text-foreground font-medium mb-1">No live cameras</p>
        <p className="text-sm">Start a camera to see it on the wall.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-1.5">
        <span className="label-eyebrow text-muted-foreground mr-1">grid</span>
        {COLS.map((c) => (
          <Button
            key={c}
            variant={cols === c ? 'secondary' : 'outline'}
            size="sm"
            className="h-8 w-9 text-xs font-data"
            onClick={() => setCols(c)}
          >
            {c}
          </Button>
        ))}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {running.map((c) => (
          // Click a tile to open the low-latency close-up (WebRTC, MSE fallback).
          <button
            key={c.id}
            type="button"
            onClick={() => setExpanded(c)}
            className="text-left focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-lg"
            title="Open low-latency close-up"
          >
            <Tile camera={c} />
          </button>
        ))}
      </div>

      <Dialog open={!!expanded} onOpenChange={(o) => !o && setExpanded(null)}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden bg-black border-border">
          <DialogTitle className="sr-only">{expanded?.config.name ?? 'Camera'} live close-up</DialogTitle>
          {expanded && (
            <div className="relative aspect-video bg-black">
              <CameraVideo cameraId={expanded.id} className="w-full h-full" />
              <div className="absolute bottom-0 inset-x-0 px-4 py-2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-signal" />
                  <span className="text-sm text-white/90 truncate">{expanded.config.name}</span>
                  <span className="label-eyebrow text-white/40 ml-1">low-latency</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
