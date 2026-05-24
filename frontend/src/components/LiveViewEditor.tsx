import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import { X, Save, Trash2, Plus } from 'lucide-react';
import { api, snapshotUrl } from '../api';
import type { CameraStatus, LiveView, LiveViewTile } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const RESOLUTION_PRESETS: Array<{ name: string; w: number; h: number }> = [
  { name: '1920×1080', w: 1920, h: 1080 },
  { name: '2560×1440', w: 2560, h: 1440 },
  { name: '3840×2160', w: 3840, h: 2160 },
];

interface DraftTile extends LiveViewTile {
  /** Stable internal id so React keys stay put while the layout mutates. */
  _key: number;
}

interface LiveViewEditorProps {
  cameras: CameraStatus[];
  /** ID of an existing Live View to edit; null = create new. */
  editingId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

/**
 * Drag/resize editor for a Live View layout.
 *
 * Tiles store integer pixel coords on a virtual canvas (default 1920×1080).
 * The player aspect-fits this canvas into the actual viewport so a layout
 * authored at 1920×1080 renders identically on a 4K display.
 */
export default function LiveViewEditor({
  cameras,
  editingId,
  onClose,
  onSaved,
  onError,
}: LiveViewEditorProps) {
  const [name, setName] = useState('');
  const [canvas, setCanvas] = useState({ w: 1920, h: 1080 });
  const [tiles, setTiles] = useState<DraftTile[]>([]);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const seededRef = useRef(false);
  const nextKey = useRef(1);

  // Load existing or seed defaults
  useEffect(() => {
    if (seededRef.current) return;
    if (editingId) {
      api
        .getLiveView(editingId)
        .then((v: LiveView) => {
          setName(v.name);
          setCanvas(v.canvas);
          setTiles(v.tiles.map((t) => ({ ...t, _key: nextKey.current++ })));
          seededRef.current = true;
        })
        .catch((e) => onError(`Failed to load Live View: ${e instanceof Error ? e.message : e}`));
    } else {
      setName('Untitled Live View');
      seededRef.current = true;
    }
  }, [editingId, onError]);

  // Fit the canvas into the available stage area; the rendered canvas is
  // an untransformed div sized at scale×canvas px so react-rnd's pixel
  // coordinates stay correct.
  useEffect(() => {
    const recompute = () => {
      const el = stageRef.current?.parentElement;
      if (!el) return;
      const availW = el.clientWidth - 32;
      const availH = el.clientHeight - 32;
      const s = Math.min(availW / canvas.w, availH / canvas.h, 1);
      setScale(s);
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [canvas.w, canvas.h]);

  const placedCameras = useMemo(() => new Set(tiles.map((t) => t.camera_id)), [tiles]);
  const palette = useMemo(
    () =>
      cameras.filter(
        (c) => c.status !== 'error' && !!c.config.id, // any healthy-ish camera
      ),
    [cameras],
  );

  const addTile = (cameraId: string) => {
    // Default tile size = 1/4 of canvas, placed at first free quadrant.
    const tw = Math.floor(canvas.w / 2);
    const th = Math.floor(canvas.h / 2);
    const positions = [
      { x: 0, y: 0 },
      { x: tw, y: 0 },
      { x: 0, y: th },
      { x: tw, y: th },
    ];
    const occupied = new Set(tiles.map((t) => `${t.x},${t.y}`));
    const pos = positions.find((p) => !occupied.has(`${p.x},${p.y}`)) || positions[0];
    const t: DraftTile = {
      _key: nextKey.current++,
      camera_id: cameraId,
      x: pos.x,
      y: pos.y,
      w: tw,
      h: th,
    };
    setTiles((prev) => [...prev, t]);
    setSelectedKey(t._key);
  };

  const updateTile = useCallback((key: number, patch: Partial<LiveViewTile>) => {
    setTiles((prev) =>
      prev.map((t) =>
        t._key === key
          ? {
              ...t,
              ...patch,
            }
          : t,
      ),
    );
  }, []);

  const removeTile = (key: number) => {
    setTiles((prev) => prev.filter((t) => t._key !== key));
    if (selectedKey === key) setSelectedKey(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      onError('Name is required');
      return;
    }
    if (tiles.length === 0) {
      onError('Add at least one tile');
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      canvas,
      tiles: tiles.map(({ _key, ...t }) => t), // eslint-disable-line @typescript-eslint/no-unused-vars
    };
    try {
      if (editingId) {
        await api.updateLiveView(editingId, payload);
      } else {
        await api.addLiveView(payload);
      }
      onSaved();
    } catch (e) {
      onError(`Failed to save: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="surface-glass h-14 px-4 flex items-center gap-3 border-b border-border/60">
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div>
            <div className="label-eyebrow text-primary/70">composing</div>
          </div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-xs"
            placeholder="Live View name"
          />
          <div className="flex items-center gap-1">
            <Label className="label-eyebrow text-muted-foreground/70 mr-1">canvas</Label>
            <select
              value={`${canvas.w}x${canvas.h}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                setCanvas({ w, h });
              }}
              className="h-8 rounded-md border border-border bg-card/40 px-2 text-xs font-data"
            >
              {RESOLUTION_PRESETS.map((p) => (
                <option key={p.name} value={`${p.w}x${p.h}`}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>
          <X className="w-4 h-4 mr-1.5" /> Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-1.5" />
          {saving ? 'Saving…' : 'Save Live View'}
        </Button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Palette */}
        <aside className="w-56 border-r border-border/60 surface-panel rounded-none p-3 overflow-y-auto">
          <div className="label-eyebrow text-muted-foreground/70 mb-2">cameras</div>
          {palette.length === 0 ? (
            <p className="text-xs text-muted-foreground">No cameras configured.</p>
          ) : (
            <ul className="space-y-1.5">
              {palette.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => addTile(c.id)}
                    className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md hover:bg-accent/40 text-sm transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary/70" />
                    <span className="flex-1 truncate">{c.config.name || c.id}</span>
                    {placedCameras.has(c.id) && (
                      <span className="text-[0.625rem] font-data text-primary/70">●</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Canvas */}
        <div className="flex-1 min-w-0 grid place-items-center overflow-hidden bg-[hsl(var(--background))]">
          <div
            ref={stageRef}
            className="relative bg-black ring-1 ring-border/60"
            style={{
              width: canvas.w * scale,
              height: canvas.h * scale,
            }}
            onClick={() => setSelectedKey(null)}
          >
            {tiles.map((t) => {
              const cam = cameras.find((c) => c.id === t.camera_id);
              const isSelected = selectedKey === t._key;
              return (
                <Rnd
                  key={t._key}
                  size={{ width: t.w * scale, height: t.h * scale }}
                  position={{ x: t.x * scale, y: t.y * scale }}
                  bounds="parent"
                  onDragStop={(_e, d) =>
                    updateTile(t._key, { x: Math.round(d.x / scale), y: Math.round(d.y / scale) })
                  }
                  onResizeStop={(_e, _dir, ref, _delta, pos) =>
                    updateTile(t._key, {
                      x: Math.round(pos.x / scale),
                      y: Math.round(pos.y / scale),
                      w: Math.round(ref.offsetWidth / scale),
                      h: Math.round(ref.offsetHeight / scale),
                    })
                  }
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setSelectedKey(t._key);
                  }}
                  className={cn(
                    'overflow-hidden ring-1',
                    isSelected
                      ? 'ring-2 ring-primary'
                      : 'ring-border/70 hover:ring-primary/40',
                  )}
                >
                  <div className="relative w-full h-full bg-card/60">
                    {cam ? (
                      <img
                        src={snapshotUrl(cam.id)}
                        alt={cam.config.name || cam.id}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-xs text-destructive font-data">
                        missing camera
                      </div>
                    )}
                    <div className="absolute inset-x-0 top-0 px-2 py-1 bg-gradient-to-b from-black/70 to-transparent">
                      <div className="text-[0.625rem] font-data text-foreground/90 truncate">
                        {cam?.config.name || t.camera_id}
                      </div>
                    </div>
                    {isSelected && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeTile(t._key);
                        }}
                        className="absolute top-1 right-1 p-1 rounded bg-destructive/80 text-destructive-foreground hover:bg-destructive"
                        title="Remove tile"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </Rnd>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
