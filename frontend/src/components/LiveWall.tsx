import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  MonitorPlay,
  Maximize2,
  Expand,
  Plus,
  Pencil,
  RefreshCw,
  X,
  ChevronDown,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import type { CameraStatus, LiveView } from '../types';
import HlsPlayer from './HlsPlayer';
import CameraVideo from './CameraVideo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fitCanvas, tileRect } from '@/lib/liveViewLayout';
import { api } from '../api';

const ACTIVE_VIEW_KEY = 'unifi-cam-proxy:wall:active-view';

interface LiveWallProps {
  cameras: CameraStatus[];
  /** Hand off to App so the operator can jump straight to the Live Views
   *  editor for the currently-displayed layout (or create a new one when
   *  passed null). */
  onEditView: (id: string | null) => void;
}

export default function LiveWall({ cameras, onEditView }: LiveWallProps) {
  const [views, setViews] = useState<LiveView[] | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(
    () => localStorage.getItem(ACTIVE_VIEW_KEY),
  );
  const [expanded, setExpanded] = useState<CameraStatus | null>(null);
  const handleExpand = useCallback((c: CameraStatus) => setExpanded(c), []);

  const reload = useCallback(() => {
    api
      .listLiveViews()
      .then(setViews)
      .catch(() => setViews([]));
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
    if (id) localStorage.setItem(ACTIVE_VIEW_KEY, id);
    else localStorage.removeItem(ACTIVE_VIEW_KEY);
  }, []);

  // Default-pick when nothing is selected (first view in the list).
  useEffect(() => {
    if (!views || views.length === 0) return;
    if (!activeId || !views.find((v) => v.id === activeId)) {
      setActiveId(views[0].id);
    }
  }, [views, activeId, setActiveId]);

  const activeView = useMemo(
    () => (views && activeId ? views.find((v) => v.id === activeId) ?? null : null),
    [views, activeId],
  );

  // Loading shimmer while the manifest fetches.
  if (views === null) {
    return (
      <div className="relative min-h-[60vh] grid place-items-center">
        <div className="text-sm text-muted-foreground">Loading Live Views…</div>
      </div>
    );
  }

  // No saved layouts yet — invite the operator to create one.
  if (views.length === 0) {
    return (
      <div className="relative min-h-[60vh] grid place-items-center overflow-hidden empty-stage">
        <div className="relative text-center space-y-4 max-w-md animate-rise">
          <div className="mx-auto w-20 h-20 rounded-2xl border border-border bg-card/40 grid place-items-center backdrop-blur-sm shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]">
            <MonitorPlay className="w-9 h-9 text-muted-foreground/70" />
          </div>
          <div>
            <div className="label-eyebrow text-primary/70 mb-1">empty</div>
            <p className="text-foreground font-medium">No Live Views yet</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              The wall plays a saved Live View. Compose a layout — any aspect
              ratio, any number of tiles, sized however you want — and it
              becomes selectable here.
            </p>
          </div>
          <Button onClick={() => onEditView(null)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Compose first Live View
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls strip */}
      <div className="flex items-center justify-between gap-3 px-1 flex-wrap">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="label-eyebrow text-muted-foreground">live wall</span>
          <ViewPicker views={views} activeId={activeId} onPick={setActiveId} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={reload}
            title="Reload Live Views"
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reload
          </Button>
          {activeId && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => onEditView(activeId)}
            >
              <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit layout
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => onEditView(null)}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New
          </Button>
        </div>
      </div>

      {activeView ? (
        <CanvasBody
          view={activeView}
          cameras={cameras}
          onExpand={handleExpand}
        />
      ) : (
        <div className="text-sm text-muted-foreground">Pick a Live View above.</div>
      )}

      {/* Close-up overlay — Radix primitives directly so the auto-X doesn't
          collide with our HUD close button. */}
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

/** Segmented control if there are ≤4 views, dropdown otherwise. */
function ViewPicker({
  views,
  activeId,
  onPick,
}: {
  views: LiveView[];
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  if (views.length <= 4) {
    return (
      <div className="flex items-center rounded-md border border-border bg-card/40 p-0.5">
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => onPick(v.id)}
            className={cn(
              'h-7 px-3 rounded text-xs transition-colors',
              activeId === v.id
                ? 'bg-primary/20 text-primary ring-1 ring-inset ring-primary/40'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
            )}
            title={`${v.tiles.length} tile${v.tiles.length === 1 ? '' : 's'} · ${v.canvas.w}×${v.canvas.h}`}
          >
            {v.name}
          </button>
        ))}
      </div>
    );
  }
  const active = views.find((v) => v.id === activeId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
          {active?.name ?? 'Pick a layout'}
          <ChevronDown className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[14rem]">
        {views.map((v) => (
          <DropdownMenuItem
            key={v.id}
            onSelect={() => onPick(v.id)}
            className={cn('flex justify-between gap-3', v.id === activeId && 'text-primary')}
          >
            <span className="truncate">{v.name}</span>
            <span className="text-[0.6875rem] text-muted-foreground/70 font-data tabular-nums">
              {v.tiles.length}t · {v.canvas.w}×{v.canvas.h}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Aspect-fit canvas renderer. Tiles whose camera isn't running show a
 *  muted placeholder so the wall still reflects the saved layout
 *  faithfully — the operator can see which slot is dark. */
function CanvasBody({
  view,
  cameras,
  onExpand,
}: {
  view: LiveView;
  cameras: CameraStatus[];
  onExpand: (c: CameraStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useMemo(() => fitCanvas(view.canvas, size), [view.canvas, size]);
  const cameraById = useMemo(
    () => new Map(cameras.map((c) => [c.id, c])),
    [cameras],
  );

  // Container is sized to take the rest of the viewport below the controls
  // strip. The min-height keeps the empty/loading paths usable on short
  // viewports.
  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100vh-13rem)] min-h-[420px] rounded-lg overflow-hidden border border-border bg-black/40"
    >
      {/* Letterbox backdrop strips outside the rendered canvas — keeps the
          NVR feel even when the saved canvas doesn't match the viewport
          aspect ratio. */}
      <div
        className="absolute"
        style={{
          left: fit.offsetX,
          top: fit.offsetY,
          width: fit.width,
          height: fit.height,
        }}
      >
        {view.tiles.map((t, i) => {
          const rect = tileRect(t, fit.scale);
          const cam = cameraById.get(t.camera_id);
          const isRunning = cam?.status === 'running';
          return (
            <CanvasTile
              key={`${t.camera_id}:${i}`}
              channel={i + 1}
              rect={rect}
              camera={cam}
              isRunning={isRunning}
              onExpand={onExpand}
            />
          );
        })}
      </div>
    </div>
  );
}

function CanvasTile({
  channel,
  rect,
  camera,
  isRunning,
  onExpand,
}: {
  channel: number;
  rect: { left: number; top: number; width: number; height: number };
  camera: CameraStatus | undefined;
  isRunning: boolean;
  onExpand: (c: CameraStatus) => void;
}) {
  const tileRef = useRef<HTMLDivElement>(null);
  const [res, setRes] = useState<{ w: number; h: number } | null>(null);

  const goFullscreen = (e: MouseEvent) => {
    e.stopPropagation();
    const el = tileRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  const clickable = !!camera && isRunning;
  const ariaLabel = camera ? `Camera ${camera.config.name}` : 'Empty slot';

  return (
    <div
      ref={tileRef}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : -1}
      onClick={clickable && camera ? () => onExpand(camera) : undefined}
      onKeyDown={
        clickable && camera
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onExpand(camera);
              }
            }
          : undefined
      }
      className={cn(
        'group absolute overflow-hidden rounded-md border border-border ring-1 ring-inset ring-primary/5 corner-ticks scanlines transition-all bg-black',
        clickable && 'cursor-pointer hover:ring-primary/30 hover:shadow-[0_0_0_1px_hsl(var(--signal)/0.3),0_12px_28px_-12px_hsl(var(--signal)/0.4)]',
      )}
      style={rect}
      aria-label={ariaLabel}
    >
      {camera && isRunning ? (
        <HlsPlayer cameraId={camera.id} className="w-full h-full object-cover" onMeta={(m) => setRes({ w: m.width, h: m.height })} />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,hsl(var(--card)),transparent_70%)]">
          <div className="text-center space-y-1">
            <div className="label-eyebrow text-muted-foreground/70">
              {camera ? camera.status : 'unassigned'}
            </div>
            <div className="text-xs text-muted-foreground/85 truncate max-w-[80%] mx-auto">
              {camera?.config.name ?? 'No camera'}
            </div>
          </div>
        </div>
      )}

      {/* Top HUD */}
      <div className="absolute top-0 inset-x-0 px-2 pt-1.5 pb-2 flex items-start justify-between gap-2 bg-gradient-to-b from-black/85 via-black/30 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="label-hud text-primary/95 shrink-0 tabular-nums">
            CH {String(channel).padStart(2, '0')}
          </span>
          {camera && (
            <>
              <span className="h-3 w-px bg-white/15 shrink-0" />
              <span className="text-[0.6875rem] text-white truncate font-medium">
                {camera.config.name}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 pointer-events-auto">
          {isRunning && (
            <span className="chip chip-good !py-0 !px-1.5 !text-[0.5625rem]">
              <span className="w-1 h-1 rounded-full bg-current animate-signal" />
              LIVE
            </span>
          )}
          {clickable && (
            <>
              <button
                type="button"
                onClick={goFullscreen}
                title="Fullscreen this stream"
                className="p-1 rounded text-white/75 hover:text-white hover:bg-white/10 transition-colors"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (camera) onExpand(camera);
                }}
                title="Open low-latency close-up"
                className="p-1 rounded text-white/75 hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Expand className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom HUD — only when running. */}
      {isRunning && (
        <div className="absolute bottom-0 inset-x-0 px-2 pb-1.5 pt-2 flex items-end justify-between gap-2 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none">
          <div className="flex items-center gap-2 min-w-0">
            <span className="label-hud text-white/65">HLS</span>
            {res ? (
              <span className="font-data text-[0.625rem] text-white/85 tabular-nums">
                {res.w}×{res.h}
              </span>
            ) : (
              <span className="font-data text-[0.625rem] text-white/50">connecting…</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
