import { memo, useCallback, useMemo, useRef, useState, type MouseEvent } from 'react';
import { MonitorPlay, Maximize2, Expand, Activity, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { CameraStatus } from '../types';
import HlsPlayer from './HlsPlayer';
import CameraVideo from './CameraVideo';
import { cn } from '@/lib/utils';
import { useTicker } from '@/lib/useTicker';

const COLS = [1, 2, 3, 4] as const;

function formatUptime(seconds: number | null): string {
  if (!seconds || seconds < 1) return '—';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${String(s).padStart(2, '0')}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** 1-Hz uptime label derived from started_at; owns its own ticker so the
 *  parent tile stays memo'd and the HLS player doesn't get torn down by
 *  every second's re-render. */
const LiveUptime = memo(function LiveUptime({ startedAt }: { startedAt: number | null | undefined }) {
  const tick = useTicker(1000);
  if (startedAt == null) return <>{formatUptime(null)}</>;
  return <>{formatUptime(Math.max(0, Math.floor(tick / 1000 - startedAt)))}</>;
});

function ChannelTileImpl({
  camera,
  channel,
  onExpand,
}: {
  camera: CameraStatus;
  channel: number;
  onExpand: (c: CameraStatus) => void;
}) {
  const tileRef = useRef<HTMLDivElement>(null);
  const [res, setRes] = useState<{ w: number; h: number } | null>(null);

  const goFullscreen = (e: MouseEvent) => {
    e.stopPropagation();
    const el = tileRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={() => onExpand(camera)}
      className="group relative aspect-video w-full bg-black rounded-md overflow-hidden border border-border ring-1 ring-inset ring-primary/5 corner-ticks scanlines text-left transition-all hover:ring-primary/30 hover:shadow-[0_0_0_1px_hsl(var(--signal)/0.3),0_12px_28px_-12px_hsl(var(--signal)/0.4)]"
    >
      <div ref={tileRef} className="absolute inset-0">
        <HlsPlayer
          cameraId={camera.id}
          className="w-full h-full object-cover"
          onMeta={(m) => setRes({ w: m.width, h: m.height })}
        />
      </div>

      {/* Top HUD strip */}
      <div className="absolute top-0 inset-x-0 px-3 pt-2 pb-3 flex items-start justify-between gap-2 bg-gradient-to-b from-black/85 via-black/30 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="label-hud text-primary/95 shrink-0 tabular-nums">
            CH {String(channel).padStart(2, '0')}
          </span>
          <span className="h-3 w-px bg-white/15 shrink-0" />
          <span className="text-xs text-white truncate font-medium">{camera.config.name}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 pointer-events-auto">
          <span className="chip chip-good !py-0 !px-1.5">
            <span className="w-1 h-1 rounded-full bg-current animate-signal" />
            LIVE
          </span>
          <button
            type="button"
            onClick={goFullscreen}
            title="Fullscreen this stream"
            className="p-1 rounded text-white/75 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExpand(camera);
            }}
            title="Open low-latency close-up"
            className="p-1 rounded text-white/75 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Expand className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom HUD strip */}
      <div className="absolute bottom-0 inset-x-0 px-3 pb-2 pt-3 flex items-end justify-between gap-2 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="label-hud text-white/65">HLS</span>
          {res ? (
            <span className="font-data text-[0.6875rem] text-white/85 tabular-nums">
              {res.w}×{res.h}
            </span>
          ) : (
            <span className="font-data text-[0.6875rem] text-white/50">connecting…</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="w-3 h-3 text-primary animate-tick" />
          <span className="font-data text-[0.6875rem] text-white/85 tabular-nums">
            <LiveUptime startedAt={camera.started_at} />
          </span>
        </div>
      </div>
    </button>
  );
}

const ChannelTile = memo(ChannelTileImpl, (prev, next) => {
  const a = prev.camera;
  const b = next.camera;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.started_at === b.started_at &&
    a.config.name === b.config.name &&
    prev.channel === next.channel &&
    prev.onExpand === next.onExpand
  );
});

export default function LiveWall({ cameras }: { cameras: CameraStatus[] }) {
  const running = useMemo(() => cameras.filter((c) => c.status === 'running'), [cameras]);

  // Auto-pick a sensible matrix size by channel count; user can override.
  const defaultCols = running.length <= 1 ? 1 : running.length <= 4 ? 2 : running.length <= 9 ? 3 : 4;
  const [cols, setCols] = useState<number>(defaultCols);
  const [expanded, setExpanded] = useState<CameraStatus | null>(null);
  const handleExpand = useCallback((c: CameraStatus) => setExpanded(c), []);

  if (running.length === 0) {
    return (
      <div className="relative min-h-[60vh] grid place-items-center">
        <div className="absolute inset-0 [background:radial-gradient(circle_at_center,hsl(var(--signal)/0.08),transparent_60%)] pointer-events-none" />
        <div className="relative text-center space-y-3 animate-rise">
          <div className="mx-auto w-20 h-20 rounded-2xl border border-border bg-card/40 grid place-items-center backdrop-blur-sm shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]">
            <MonitorPlay className="w-9 h-9 text-muted-foreground/70" />
          </div>
          <div>
            <div className="label-eyebrow text-primary/70 mb-1">offline</div>
            <p className="text-foreground font-medium">No live channels</p>
            <p className="text-sm text-muted-foreground">Start a camera to see it on the wall.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls strip */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-baseline gap-2">
          <span className="label-eyebrow text-muted-foreground">channels</span>
          <span className="font-data text-base text-foreground tabular-nums leading-none">
            {String(running.length).padStart(2, '0')}
          </span>
          <span className="label-hud text-muted-foreground/60">of {cameras.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="label-eyebrow text-muted-foreground hidden sm:inline">matrix</span>
          <div className="flex items-center rounded-md border border-border bg-card/40 p-0.5">
            {COLS.map((c) => (
              <button
                key={c}
                onClick={() => setCols(c)}
                className={cn(
                  'h-7 w-8 rounded text-xs font-data tabular-nums transition-colors',
                  cols === c
                    ? 'bg-primary/20 text-primary ring-1 ring-inset ring-primary/40'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="grid gap-3 animate-rise-stagger"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {running.map((c, i) => (
          <ChannelTile key={c.id} camera={c} channel={i + 1} onExpand={handleExpand} />
        ))}
      </div>

      {/* Close-up overlay — Radix primitives directly so no built-in X collides
          with our own HUD close button. */}
      <DialogPrimitive.Root open={!!expanded} onOpenChange={(o) => !o && setExpanded(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="fixed inset-4 md:inset-8 z-50 flex flex-col rounded-lg overflow-hidden border border-border bg-black shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogPrimitive.Title className="sr-only">
              {expanded?.config.name ?? 'Camera'} close-up
            </DialogPrimitive.Title>
            {/* Custom HUD header — owns the close button so the default X
                from shadcn's DialogContent (which collided with controls in
                the GridFusion editor) is intentionally not in play here. */}
            <div className="h-12 shrink-0 flex items-center justify-between gap-4 px-4 surface-glass border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0">
                <span className="label-hud text-primary/95 shrink-0">close-up</span>
                <span className="h-3.5 w-px bg-white/15 shrink-0" />
                <span className="text-sm text-white font-medium truncate">{expanded?.config.name}</span>
                <span className="hidden md:inline-flex chip chip-good !py-0 !px-1.5">
                  <span className="w-1 h-1 rounded-full bg-current animate-signal" />
                  LIVE
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden md:inline label-hud text-white/55">low-latency</span>
                <button
                  type="button"
                  onClick={() => setExpanded(null)}
                  className="p-1.5 rounded text-white/75 hover:text-white hover:bg-white/10 transition-colors"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 relative bg-black scanlines">
              {expanded && (
                <CameraVideo cameraId={expanded.id} className="absolute inset-0 w-full h-full" />
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
