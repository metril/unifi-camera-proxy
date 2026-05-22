import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { Plus, Link2, Cctv, Save, Shuffle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CameraConfig, CameraStatus, GridFusionTile } from '../../types';
import TilePreview from './TilePreview';

interface EditorTile extends GridFusionTile {
  key: string;
  label: string;
}

interface GridFusionEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: CameraConfig) => void;
  cameras: CameraStatus[];
  editCamera?: CameraConfig | null;
}

const RES_PRESETS = [
  { label: '1080p', w: 1920, h: 1080 },
  { label: '1440p', w: 2560, h: 1440 },
  { label: '4K', w: 3840, h: 2160 },
];

const MIN_TILE = 80; // minimum tile size in output pixels

function genMac(): string {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  return `AABBCC${hex()}${hex()}${hex()}`;
}

let keySeq = 0;
const nextKey = () => `t${Date.now()}_${keySeq++}`;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function GridFusionEditor({ isOpen, onClose, onSave, cameras, editCamera }: GridFusionEditorProps) {
  const [name, setName] = useState('');
  const [mac, setMac] = useState('');
  const [outW, setOutW] = useState(1920);
  const [outH, setOutH] = useState(1080);
  const [tiles, setTiles] = useState<EditorTile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');

  const fitRef = useRef<HTMLDivElement>(null);
  const [fitW, setFitW] = useState(0);
  const seededRef = useRef(false);

  // Seed once per open; guarded so the parent's 3s poll can't wipe the layout.
  useEffect(() => {
    if (!isOpen) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current) return;
    seededRef.current = true;
    if (editCamera) {
      setName(editCamera.name || '');
      setMac(editCamera.mac || genMac());
      setOutW((editCamera.output_width as number) || 1920);
      setOutH((editCamera.output_height as number) || 1080);
      setTiles(
        ((editCamera.tiles as GridFusionTile[]) || []).map((t) => ({
          ...t,
          key: nextKey(),
          label: t.source
            ? cameras.find((c) => c.id === t.source)?.config.name || t.source
            : t.url || 'stream',
        })),
      );
    } else {
      setName('');
      setMac(genMac());
      setOutW(1920);
      setOutH(1080);
      setTiles([]);
    }
    setSelected(null);
    setUrlDraft('');
  }, [isOpen, editCamera, cameras]);

  // Measure the fit container. Re-measure on resize AND on the next frame after
  // open (the dialog animates in, so the first synchronous read can be stale).
  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = fitRef.current;
    if (!el) return;
    const measure = () => setFitW(el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    const raf = requestAnimationFrame(measure);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [isOpen]);

  // Visual scale: fit the output-pixel stage into the measured width.
  const scale = fitW > 0 ? fitW / outW : 0.4;
  const scaledH = outH * scale;

  const update = (key: string, patch: Partial<EditorTile>) =>
    setTiles((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const addTile = (partial: Omit<EditorTile, 'key' | 'x' | 'y' | 'w' | 'h'>) => {
    setTiles((prev) => {
      const n = prev.length;
      const w = Math.round(outW / 2);
      const h = Math.round(outH / 2);
      const x = clamp(Math.round((n % 3) * (outW / 6)), 0, outW - w);
      const y = clamp(Math.round((n % 3) * (outH / 6)), 0, outH - h);
      return [...prev, { ...partial, key: nextKey(), x, y, w, h }];
    });
  };

  const addUrlTile = () => {
    const url = urlDraft.trim();
    if (!url) return;
    addTile({ url, label: url });
    setUrlDraft('');
  };

  const removeTile = (key: string) => {
    setTiles((prev) => prev.filter((t) => t.key !== key));
    if (selected === key) setSelected(null);
  };

  const applyGrid = (cols: number, rows: number) => {
    const tw = Math.floor(outW / cols);
    const th = Math.floor(outH / rows);
    setTiles((prev) =>
      prev.slice(0, cols * rows).map((t, i) => ({
        ...t,
        x: (i % cols) * tw,
        y: Math.floor(i / cols) * th,
        w: tw,
        h: th,
      })),
    );
  };

  const setResolution = (w: number, h: number) => {
    const sx = w / outW;
    const sy = h / outH;
    setTiles((prev) =>
      prev.map((t) => ({
        ...t,
        x: Math.round(t.x * sx),
        y: Math.round(t.y * sy),
        w: Math.round(t.w * sx),
        h: Math.round(t.h * sy),
      })),
    );
    setOutW(w);
    setOutH(h);
  };

  const canSave = !!name.trim() && !!mac.trim() && tiles.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: editCamera?.id || '',
      enabled: editCamera?.enabled ?? true,
      name: name.trim(),
      mac: mac.trim(),
      ip: (editCamera?.ip as string) || '',
      model: (editCamera?.model as string) || 'UVC G4 Bullet',
      fw_version: (editCamera?.fw_version as string) || 'UVC.S2L.v4.23.8.67.0eba6e3.200526.1046',
      type: 'mosaic',
      output_width: outW,
      output_height: outH,
      tiles: tiles.map(({ source, url, x, y, w, h }) => ({ source, url, x, y, w, h })),
    });
  };

  const usedCameraIds = new Set(tiles.map((t) => t.source).filter(Boolean));
  const selectedTile = tiles.find((t) => t.key === selected) || null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[96vw] w-[96vw] h-[92vh] max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">GridFusion composition editor</DialogTitle>

        {/* Header */}
        <div className="h-16 shrink-0 flex items-center gap-4 px-5 border-b border-border">
          <div className="flex items-center gap-2 text-primary">
            <Cctv className="w-5 h-5" />
            <span className="label-eyebrow">GridFusion</span>
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Composition name" className="max-w-xs h-9" />
          <div className="flex items-center gap-1.5">
            <Input value={mac} onChange={(e) => setMac(e.target.value)} placeholder="MAC" className="w-44 h-9 font-data text-xs" />
            <Button variant="outline" size="sm" className="h-9" onClick={() => setMac(genMac())} title="Randomize MAC">
              <Shuffle className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="h-9" disabled={!canSave} onClick={handleSave}>
              <Save className="w-4 h-4 mr-1.5" /> Save composition
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Palette */}
          <div className="w-64 shrink-0 border-r border-border flex flex-col min-h-0">
            <div className="px-4 py-3 label-eyebrow text-muted-foreground border-b border-border">Cameras</div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {cameras.filter((c) => c.config.type !== 'mosaic').length === 0 && (
                <p className="text-xs text-muted-foreground px-1">No cameras configured yet.</p>
              )}
              {cameras
                .filter((c) => c.config.type !== 'mosaic')
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => addTile({ source: c.id, label: c.config.name })}
                    className="w-full flex items-center gap-2 rounded-md border border-border bg-card/50 px-2.5 py-2 text-left text-sm hover:border-primary/50 hover:bg-accent/50 transition-colors"
                  >
                    <Cctv className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{c.config.name}</span>
                    {usedCameraIds.has(c.id) && <span className="text-[10px] text-primary font-data">on canvas</span>}
                    <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                ))}
            </div>
            <div className="p-3 border-t border-border space-y-2">
              <Label className="label-eyebrow text-muted-foreground flex items-center gap-1.5">
                <Link2 className="w-3 h-3" /> RTSP URL
              </Label>
              <div className="flex gap-1.5">
                <Input
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addUrlTile()}
                  placeholder="rtsp://…"
                  className="h-8 text-xs font-data"
                />
                <Button variant="outline" size="sm" className="h-8" onClick={addUrlTile} disabled={!urlDraft.trim()}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 min-w-0 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,hsl(216_34%_17%/0.4),transparent_70%)]">
            <div className="w-full max-w-5xl">
              {/* Fit container clips the scaled stage's layout box (transform
                  shrinks it visually but not its 1920px layout footprint). */}
              <div ref={fitRef} className="relative w-full overflow-hidden" style={{ height: scaledH || 360 }}>
                {/* Stage at true output pixels, visually scaled via CSS transform. */}
                <div
                  className="absolute top-0 left-0 bg-black/60 border border-border rounded-lg overflow-hidden shadow-2xl ring-1 ring-primary/10"
                  style={{ width: outW, height: outH, transform: `scale(${scale})`, transformOrigin: 'top left' }}
                  onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}
                >
                  <div
                    className="absolute inset-0 pointer-events-none opacity-[0.12]"
                    style={{
                      backgroundImage:
                        'linear-gradient(hsl(217 91% 60%) 1px, transparent 1px), linear-gradient(90deg, hsl(217 91% 60%) 1px, transparent 1px)',
                      backgroundSize: `${outW / 8}px ${outH / 8}px`,
                    }}
                  />
                  {tiles.length === 0 && (
                    <div
                      className="absolute inset-0 flex items-center justify-center text-muted-foreground"
                      style={{ fontSize: `${Math.round(15 / scale)}px` }}
                    >
                      Add cameras from the left to build your matrix
                    </div>
                  )}
                  {tiles.map((tile) => (
                    <Rnd
                      key={tile.key}
                      scale={scale}
                      bounds="parent"
                      minWidth={MIN_TILE}
                      minHeight={MIN_TILE}
                      size={{ width: tile.w, height: tile.h }}
                      position={{ x: tile.x, y: tile.y }}
                      onDragStart={() => setSelected(tile.key)}
                      onDragStop={(_e, d) =>
                        update(tile.key, {
                          x: clamp(Math.round(d.x), 0, outW - tile.w),
                          y: clamp(Math.round(d.y), 0, outH - tile.h),
                        })
                      }
                      onResizeStart={() => setSelected(tile.key)}
                      onResizeStop={(_e, _dir, ref, _delta, pos) =>
                        update(tile.key, {
                          w: Math.max(MIN_TILE, Math.round(ref.offsetWidth)),
                          h: Math.max(MIN_TILE, Math.round(ref.offsetHeight)),
                          x: Math.round(pos.x),
                          y: Math.round(pos.y),
                        })
                      }
                      className={selected === tile.key ? 'z-20' : 'z-10'}
                    >
                      <div
                        className={`relative w-full h-full ${selected === tile.key ? 'ring-4 ring-primary' : 'ring-2 ring-white/20'}`}
                        onMouseDown={() => setSelected(tile.key)}
                      >
                        <TilePreview tile={tile} />
                        {/* Label baked into the tile (scales with the canvas);
                            remove + precise coords live in the settings rail. */}
                        <div
                          className="absolute left-2 bottom-2 px-2 py-1 rounded bg-black/70 text-white truncate max-w-[90%]"
                          style={{ fontSize: `${Math.round(13 / scale)}px` }}
                        >
                          {tile.label}
                        </div>
                      </div>
                    </Rnd>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-muted-foreground font-data">
                output {outW}×{outH} · {tiles.length} tile{tiles.length === 1 ? '' : 's'} · drag to move, handles to resize
              </p>
            </div>
          </div>

          {/* Settings rail */}
          <div className="w-60 shrink-0 border-l border-border overflow-y-auto p-4 space-y-5">
            <div className="space-y-2">
              <Label className="label-eyebrow text-muted-foreground">Output resolution</Label>
              <div className="flex gap-1.5">
                {RES_PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    variant={outW === p.w && outH === p.h ? 'secondary' : 'outline'}
                    size="sm"
                    className="h-8 text-xs flex-1"
                    onClick={() => setResolution(p.w, p.h)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Input type="number" value={outW} onChange={(e) => setOutW(Math.max(160, Number(e.target.value) || 0))} className="h-8 text-xs font-data" />
                <span className="text-muted-foreground text-xs">×</span>
                <Input type="number" value={outH} onChange={(e) => setOutH(Math.max(120, Number(e.target.value) || 0))} className="h-8 text-xs font-data" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="label-eyebrow text-muted-foreground">Quick layouts</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {([['2 × 2', 2, 2], ['3 × 3', 3, 3], ['2 × 1', 2, 1], ['1 × 3', 1, 3]] as const).map(([label, c, r]) => (
                  <Button key={label} variant="outline" size="sm" className="h-8 text-xs" disabled={tiles.length === 0} onClick={() => applyGrid(c, r)}>
                    {label}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">Arranges current tiles into an even grid. Then nudge any tile freely.</p>
            </div>

            {selectedTile && (
              <div className="space-y-2">
                <Label className="label-eyebrow text-muted-foreground">Selected tile</Label>
                <div className="text-sm truncate">{selectedTile.label}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['x', 'y', 'w', 'h'] as const).map((dim) => (
                    <label key={dim} className="flex items-center gap-1.5">
                      <span className="w-3 text-xs text-muted-foreground font-data uppercase">{dim}</span>
                      <Input
                        type="number"
                        value={selectedTile[dim]}
                        onChange={(e) => {
                          const n = Math.max(dim === 'w' || dim === 'h' ? MIN_TILE : 0, Number(e.target.value) || 0);
                          update(selectedTile.key, { [dim]: n });
                        }}
                        className="h-8 text-xs font-data"
                      />
                    </label>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs w-full text-red-400 border-red-600/30 hover:bg-red-600/10"
                  onClick={() => removeTile(selectedTile.key)}
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Remove tile
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
