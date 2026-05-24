import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Cctv, Plus, Search, ArrowDownUp, LayoutGrid, Rows3, Grid2x2 } from 'lucide-react';
import type { CameraStatus } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import CameraCard from './CameraCard';
import CameraRow from './CameraRow';
import { cn } from '@/lib/utils';

interface CameraGridProps {
  cameras: CameraStatus[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onOpenLogs: (id: string) => void;
  onAdd: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  addLabel?: string;
  emptyIcon?: ReactNode;
}

type Density = 'cards' | 'rows' | 'dense';
type SortKey = 'name-asc' | 'name-desc' | 'status' | 'uptime' | 'restarts';
type StatusKey = CameraStatus['status'];

const ALL_STATUSES: StatusKey[] = ['running', 'restarting', 'error', 'stopped'];
const STATUS_LABELS: Record<StatusKey, string> = {
  running: 'Running',
  restarting: 'Restarting',
  error: 'Error',
  stopped: 'Idle',
};
const STATUS_CHIP: Record<StatusKey, string> = {
  running: 'chip-good',
  error: 'chip-danger',
  restarting: 'chip-warm',
  stopped: 'chip-muted',
};

const SORT_LABELS: Record<SortKey, string> = {
  'name-asc': 'Name (A→Z)',
  'name-desc': 'Name (Z→A)',
  status: 'Status (live first)',
  uptime: 'Uptime (longest first)',
  restarts: 'Most restarts',
};

const STATUS_ORDER: Record<StatusKey, number> = {
  running: 0,
  restarting: 1,
  error: 2,
  stopped: 3,
};

const LS_PREFIX = 'unifi-cam-proxy:cameras:';
function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify(v));
    } catch {}
  }, [key, v]);
  return [v, setV];
}

export default function CameraGrid({
  cameras,
  onStart,
  onStop,
  onRestart,
  onEdit,
  onDelete,
  onToggleEnabled,
  onOpenLogs,
  onAdd,
  emptyTitle = 'No cameras configured',
  emptyHint = 'Add your first camera to get started',
  addLabel = 'Add Camera',
  emptyIcon,
}: CameraGridProps) {
  const [search, setSearch] = usePersistedState<string>('search', '');
  const [statuses, setStatuses] = usePersistedState<StatusKey[]>(
    'statuses',
    [...ALL_STATUSES],
  );
  const [sort, setSort] = usePersistedState<SortKey>('sort', 'status');
  const [density, setDensity] = usePersistedState<Density>('density', 'cards');

  const statusSet = useMemo(() => new Set(statuses), [statuses]);
  const toggleStatus = (s: StatusKey) => {
    setStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cameras.filter((c) => {
      if (!statusSet.has(c.status)) return false;
      if (!q) return true;
      const haystack = [
        c.config.name,
        c.config.mac,
        c.config.ip,
        c.config.model,
        c.config.type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [cameras, statusSet, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      switch (sort) {
        case 'name-asc':
          return (a.config.name || '').localeCompare(b.config.name || '');
        case 'name-desc':
          return (b.config.name || '').localeCompare(a.config.name || '');
        case 'status':
          return (
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
            (a.config.name || '').localeCompare(b.config.name || '')
          );
        case 'uptime': {
          const aStarted = a.started_at ?? 0;
          const bStarted = b.started_at ?? 0;
          // Older started_at = longer uptime; ascending started_at = descending uptime.
          if (aStarted === bStarted) return (a.config.name || '').localeCompare(b.config.name || '');
          if (aStarted === 0) return 1;
          if (bStarted === 0) return -1;
          return aStarted - bStarted;
        }
        case 'restarts':
          return (
            (b.restart_attempt ?? 0) - (a.restart_attempt ?? 0) ||
            (a.config.name || '').localeCompare(b.config.name || '')
          );
        default:
          return 0;
      }
    });
    return list;
  }, [filtered, sort]);

  if (cameras.length === 0) {
    return (
      <div className="relative min-h-[55vh] grid place-items-center animate-rise overflow-hidden empty-stage">
        <div className="relative text-center space-y-4 max-w-sm">
          <div className="mx-auto w-20 h-20 rounded-2xl border border-border bg-card/40 grid place-items-center backdrop-blur-sm shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)] text-muted-foreground/70">
            {emptyIcon ?? <Cctv className="w-9 h-9" />}
          </div>
          <div>
            <div className="label-eyebrow text-primary/70 mb-1">empty</div>
            <p className="text-foreground font-medium">{emptyTitle}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{emptyHint}</p>
          </div>
          <Button onClick={onAdd} className="gap-1.5">
            <Plus className="w-4 h-4" /> {addLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="surface-panel rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, MAC, IP, model…"
            className="h-9 pl-8 text-xs"
          />
        </div>

        {/* Status filter chips */}
        <div className="flex items-center gap-1 flex-wrap">
          {ALL_STATUSES.map((s) => {
            const on = statusSet.has(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={cn(
                  'chip transition-opacity',
                  STATUS_CHIP[s],
                  on ? '!opacity-100' : '!opacity-40 hover:!opacity-70',
                )}
                title={`Toggle ${STATUS_LABELS[s]}`}
              >
                {STATUS_LABELS[s]}
              </button>
            );
          })}
        </div>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
              <ArrowDownUp className="w-3.5 h-3.5" /> {SORT_LABELS[sort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            <div className="label-eyebrow px-2 py-1.5 text-muted-foreground">sort by</div>
            <DropdownMenuSeparator />
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <DropdownMenuItem
                key={k}
                onSelect={() => setSort(k)}
                className={cn(k === sort && 'text-primary')}
              >
                {SORT_LABELS[k]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Density */}
        <div className="flex items-center rounded-md border border-border bg-card/40 p-0.5">
          <DensityButton current={density} on="cards" set={setDensity} icon={LayoutGrid} title="Cards" />
          <DensityButton current={density} on="rows" set={setDensity} icon={Rows3} title="Rows" />
          <DensityButton current={density} on="dense" set={setDensity} icon={Grid2x2} title="Dense matrix" />
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">
          No cameras match the current filter.
        </div>
      ) : density === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-rise-stagger">
          {sorted.map((camera) => (
            <CameraCard
              key={camera.id}
              camera={camera}
              onStart={onStart}
              onStop={onStop}
              onRestart={onRestart}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleEnabled={onToggleEnabled}
              onOpenLogs={onOpenLogs}
            />
          ))}
        </div>
      ) : density === 'rows' ? (
        <div className="space-y-1.5 animate-rise-stagger">
          {sorted.map((camera) => (
            <CameraRow
              key={camera.id}
              camera={camera}
              onStart={onStart}
              onStop={onStop}
              onRestart={onRestart}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleEnabled={onToggleEnabled}
              onOpenLogs={onOpenLogs}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 animate-rise-stagger">
          {sorted.map((camera) => (
            <DenseTile
              key={camera.id}
              camera={camera}
              onStart={onStart}
              onStop={onStop}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DensityButton({
  current,
  on,
  set,
  icon: Icon,
  title,
}: {
  current: Density;
  on: Density;
  set: (d: Density) => void;
  icon: typeof LayoutGrid;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={() => set(on)}
      title={title}
      aria-label={title}
      aria-pressed={current === on}
      className={cn(
        'h-7 w-8 grid place-items-center rounded text-xs transition-colors',
        current === on
          ? 'bg-primary/20 text-primary ring-1 ring-inset ring-primary/40'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
      )}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

/** Tiny contact-sheet tile — name + status dot + one-click open. No
 *  streaming, no thumbnail bust, no hover toolbar; for scanning 20+
 *  cameras in one glance. */
function DenseTile({
  camera,
  onStart,
  onStop,
  onEdit,
}: {
  camera: CameraStatus;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const isRunning = camera.status === 'running';
  const isError = camera.status === 'error';
  return (
    <button
      type="button"
      onClick={() => onEdit(camera.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        isRunning ? onStop(camera.id) : onStart(camera.id);
      }}
      title={`${camera.config.name || 'Unnamed'} · ${camera.status}\nRight-click to ${isRunning ? 'stop' : 'start'}`}
      className={cn(
        'group surface-panel rounded-md p-2 text-left transition-all hover:border-primary/40 hover:shadow-[0_0_0_1px_hsl(var(--signal)/0.2)]',
        isError && 'border-destructive/40',
      )}
    >
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            isRunning && 'bg-[hsl(var(--good))] animate-signal',
            camera.status === 'restarting' && 'bg-[hsl(var(--warm))]',
            isError && 'bg-destructive',
            camera.status === 'stopped' && 'bg-muted',
          )}
        />
        <span className="label-hud text-muted-foreground/70 truncate font-data">
          {camera.config.mac?.slice(-5) || '—'}
        </span>
      </div>
      <div className="text-[0.6875rem] font-medium text-foreground truncate leading-tight">
        {camera.config.name || 'Unnamed'}
      </div>
      <div className="label-hud text-muted-foreground/60 truncate mt-0.5">
        {camera.config.model || camera.config.type}
      </div>
    </button>
  );
}
