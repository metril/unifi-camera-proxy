import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { Plus, Trash2, Link2, Cctv, Save, Shuffle, X } from 'lucide-react';
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

function genMac(): string {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  return `AABBCC${hex()}${hex()}${hex()}`;
}

let keySeq = 0;
const nextKey = () => `t${Date.now()}_${keySeq++}`;

export default function GridFusionEditor({ isOpen, onClose, onSave, cameras, editCamera }: GridFusionEditorProps) {
  const [name, setName] = useState('');
  const [mac, setMac] = useState('');
  const [outW, setOutW] = useState(1920);
  const [outH, setOutH] = useState(1080);
  const [tiles, setTiles] = useState<EditorTile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);
  const seededRef = useRef(false);

  // Seed once per open from an existing GridFusion camera (or reset for a new
  // one). Guarded so the parent's 3s camera poll re-rendering doesn't wipe an
  // in-progress layout.
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
      const seed = ((editCamera.tiles as GridFusionTile[]) || []).map((t) => ({
        ...t,
        key: nextKey(),
        label: t.source
          ? cameras.find((c) => c.id === t.source)?.config.name || t.source
          : t.url || 'stream',
      }));
      setTiles(seed);
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

  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, [isOpen]);

  const scale = stageW > 0 ? stageW / outW : 0;

  const update = (key: string, patch: Partial<EditorTile>) =>
    setTiles((prev) => prev.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  const addTile = (partial: Omit<EditorTile, 'key' | 'x' | 'y' | 'w' | 'h'>) => {
    setTiles((prev) => {
      const n = prev.length;
      const w = Math.round(outW / 2);
      const h = Math.round(outH / 2);
      const x = Math.min(Math.round((n % 3) * (outW / 6)), outW - w);
      const y = Math.min(Math.round((n % 3) * (outH / 6)), outH - h);
      const tile: EditorTile = { ...partial, key: nextKey(), x, y, w, h };
      return [...prev, tile];
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

  // Arrange the current tiles into a uniform cols×rows grid.
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
    // Rescale existing tile geometry so the layout is preserved.
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

  const canSave = name.trim() && mac.trim() && tiles.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const config: CameraConfig = {
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
    };
    onSave(config);
  };

  const usedCameraIds = new Set(tiles.map((t) => t.source).filter(Boolean));

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
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Composition name"
            className="max-w-xs h-9"
          />
          <div className="flex items-center gap-1.5">
            <Input
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              placeholder="MAC"
              className="w-44 h-9 font-data text-xs"
            />
            <Button variant="outline" size="sm" className="h-9" onClick={() => setMac(genMac())} title="Randomize MAC">
              <Shuffle className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-9" onClick={onClose}>
              Cancel
            </Button>
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
              <div
                ref={stageRef}
                className="relative w-full bg-black/60 border border-border rounded-lg overflow-hidden shadow-2xl ring-1 ring-primary/10"
                style={{ aspectRatio: `${outW} / ${outH}` }}
                onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}
              >
                {/* placement grid guides */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-[0.12]"
                  style={{
                    backgroundImage:
                      'linear-gradient(hsl(217 91% 60%) 1px, transparent 1px), linear-gradient(90deg, hsl(217 91% 60%) 1px, transparent 1px)',
                    backgroundSize: `${(scale * outW) / 8}px ${(scale * outH) / 8}px`,
                  }}
                />
                {tiles.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                    Add cameras from the left to build your matrix
                  </div>
                )}
                {scale > 0 &&
                  tiles.map((tile) => (
                    <Rnd
                      key={tile.key}
                      bounds="parent"
                      size={{ width: tile.w * scale, height: tile.h * scale }}
                      position={{ x: tile.x * scale, y: tile.y * scale }}
                      onDragStart={() => setSelected(tile.key)}
                      onDragStop={(_e, d) =>
                        update(tile.key, { x: Math.round(d.x / scale), y: Math.round(d.y / scale) })
                      }
                      onResizeStart={() => setSelected(tile.key)}
                      onResizeStop={(_e, _dir, ref, _delta, pos) =>
                        update(tile.key, {
                          w: Math.round(ref.offsetWidth / scale),
                          h: Math.round(ref.offsetHeight / scale),
                          x: Math.round(pos.x / scale),
                          y: Math.round(pos.y / scale),
                        })
                      }
                      className={`group ${selected === tile.key ? 'z-20 ring-2 ring-primary' : 'z-10 ring-1 ring-white/15'}`}
                    >
                      <div className="relative w-full h-full" onMouseDown={() => setSelected(tile.key)}>
                        <TilePreview tile={tile} />
                        <div className="absolute top-1 left-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white truncate max-w-[70%]">
                            {tile.label}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTile(tile.key);
                            }}
                            className="ml-auto p-1 rounded bg-black/70 text-white hover:bg-destructive"
                            title="Remove tile"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/70 text-[9px] font-data text-white/80 opacity-0 group-hover:opacity-100 transition-opacity">
                          {tile.w}×{tile.h} @ {tile.x},{tile.y}
                        </span>
                      </div>
                    </Rnd>
                  ))}
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
                <Input
                  type="number"
                  value={outW}
                  onChange={(e) => setOutW(Math.max(160, Number(e.target.value) || 0))}
                  className="h-8 text-xs font-data"
                />
                <span className="text-muted-foreground text-xs">×</span>
                <Input
                  type="number"
                  value={outH}
                  onChange={(e) => setOutH(Math.max(120, Number(e.target.value) || 0))}
                  className="h-8 text-xs font-data"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="label-eyebrow text-muted-foreground">Quick layouts</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ['2 × 2', 2, 2],
                  ['3 × 3', 3, 3],
                  ['2 × 1', 2, 1],
                  ['1 × 3', 1, 3],
                ] as const).map(([label, c, r]) => (
                  <Button
                    key={label}
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={tiles.length === 0}
                    onClick={() => applyGrid(c, r)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Arranges current tiles into an even grid. Then nudge any tile freely.
              </p>
            </div>

            {selected && (() => {
              const t = tiles.find((x) => x.key === selected);
              if (!t) return null;
              return (
                <div className="space-y-2">
                  <Label className="label-eyebrow text-muted-foreground">Selected tile</Label>
                  <div className="text-sm truncate">{t.label}</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['x', 'y', 'w', 'h'] as const).map((dim) => (
                      <label key={dim} className="flex items-center gap-1.5">
                        <span className="w-3 text-xs text-muted-foreground font-data uppercase">{dim}</span>
                        <Input
                          type="number"
                          value={t[dim]}
                          onChange={(e) => update(t.key, { [dim]: Math.max(0, Number(e.target.value) || 0) })}
                          className="h-8 text-xs font-data"
                        />
                      </label>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs w-full text-red-400 border-red-600/30 hover:bg-red-600/10"
                    onClick={() => removeTile(t.key)}
                  >
                    <X className="w-3.5 h-3.5 mr-1" /> Remove tile
                  </Button>
                </div>
              );
            })()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
