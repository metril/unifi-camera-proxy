import { useState } from 'react';
import { MonitorPlay } from 'lucide-react';
import type { CameraStatus } from '../types';
import HlsPlayer from './HlsPlayer';
import { Button } from '@/components/ui/button';

const COLS = [1, 2, 3, 4];

export default function LiveWall({ cameras }: { cameras: CameraStatus[] }) {
  const [cols, setCols] = useState(2);
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
          <div
            key={c.id}
            className="relative aspect-video bg-black rounded-lg overflow-hidden border border-border ring-1 ring-primary/10"
          >
            <HlsPlayer cameraId={c.id} className="w-full h-full object-cover" />
            <div className="absolute bottom-0 inset-x-0 px-3 py-1.5 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-signal" />
                <span className="text-xs text-white/90 truncate">{c.config.name}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
