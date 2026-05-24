import { memo, useState } from 'react';
import {
  AlertTriangle,
  Cctv,
  Play,
  Power,
  PowerOff,
  RotateCw,
  ScrollText,
  Square,
  MoreHorizontal,
} from 'lucide-react';
import type { CameraStatus } from '../types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useTicker } from '@/lib/useTicker';

interface CameraRowProps {
  camera: CameraStatus;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onOpenLogs: (id: string) => void;
}

function formatUptimeShort(seconds: number | null): string {
  if (seconds == null || seconds < 1) return '—';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h${String(m).padStart(2, '0')}`;
  }
  return `${Math.floor(seconds / 86400)}d`;
}

const STATUS_BORDER: Record<CameraStatus['status'], string> = {
  running: 'border-l-[hsl(var(--good))]',
  error: 'border-l-destructive',
  restarting: 'border-l-[hsl(var(--warm))]',
  stopped: 'border-l-muted',
};
const STATUS_CHIP: Record<CameraStatus['status'], string> = {
  running: 'chip-good',
  error: 'chip-danger',
  restarting: 'chip-warm',
  stopped: 'chip-muted',
};
const STATUS_LABEL: Record<CameraStatus['status'], string> = {
  running: 'live',
  error: 'error',
  restarting: 'restart',
  stopped: 'idle',
};

function CameraRowImpl({
  camera,
  onStart,
  onStop,
  onRestart,
  onEdit,
  onDelete,
  onToggleEnabled,
  onOpenLogs,
}: CameraRowProps) {
  const [confirming, setConfirming] = useState(false);
  const tick = useTicker(1000);
  const isRunning = camera.status === 'running';
  const restarting = camera.status === 'restarting';
  const disabled = camera.config.enabled === false;
  const uptimeSecs =
    isRunning && camera.started_at != null
      ? Math.max(0, Math.floor(tick / 1000 - camera.started_at))
      : null;
  const restartCountdown =
    restarting && camera.next_restart_at != null
      ? Math.max(0, Math.ceil(camera.next_restart_at - Date.now() / 1000))
      : null;

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-3 px-4 py-2.5 rounded-md transition-colors',
          'surface-panel border-l-2',
          STATUS_BORDER[camera.status],
          disabled && 'opacity-70',
          'hover:border-l-primary/60 hover:bg-card/60',
        )}
      >
        {/* Status icon */}
        <div className="w-6 h-6 grid place-items-center shrink-0 text-muted-foreground">
          {camera.status === 'error' ? (
            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
          ) : restarting ? (
            <RotateCw className="w-3.5 h-3.5 text-[hsl(var(--warm))] animate-spin" />
          ) : isRunning ? (
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--good))] animate-signal" />
          ) : (
            <Cctv className="w-3.5 h-3.5 text-muted-foreground/60" />
          )}
        </div>

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate flex items-center gap-2">
            {camera.config.name || 'Unnamed'}
            <span className={cn('chip !py-0 !px-1.5 !text-[0.5625rem] shrink-0', STATUS_CHIP[camera.status])}>
              {STATUS_LABEL[camera.status]}
            </span>
            {restartCountdown != null && (
              <span className="chip chip-warm !py-0 !px-1.5 font-data tabular-nums !text-[0.5625rem]">
                {restartCountdown}s
              </span>
            )}
            {disabled && (
              <span className="chip chip-warm !py-0 !px-1.5 !text-[0.5625rem]" title="Auto-start at boot is OFF">
                auto-off
              </span>
            )}
          </div>
          <div className="label-hud text-muted-foreground/70 truncate mt-0.5 flex items-center gap-3 flex-wrap">
            <span className="font-data tabular-nums">{camera.config.mac || '—'}</span>
            {camera.config.ip && <span className="font-data tabular-nums">{camera.config.ip}</span>}
            {camera.config.model && <span className="truncate">{camera.config.model}</span>}
            {camera.pid != null && (
              <span className="font-data tabular-nums">pid {camera.pid}</span>
            )}
          </div>
        </div>

        {/* Uptime / state column */}
        <div className="hidden sm:block shrink-0 text-right">
          <div className="font-data text-[0.6875rem] text-foreground/85 tabular-nums">
            {formatUptimeShort(uptimeSecs)}
          </div>
          <div className="label-hud text-muted-foreground/60">uptime</div>
        </div>

        {/* Action toolbar — visible always (no hover) for one-line views so
            keyboard scanning works fast. */}
        <div className="flex items-center gap-0.5 shrink-0">
          {isRunning ? (
            <>
              <button
                onClick={() => onStop(camera.id)}
                title="Stop"
                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onRestart(camera.id)}
                title="Restart"
                className="p-1.5 rounded text-muted-foreground hover:text-[hsl(var(--warm))] hover:bg-[hsl(var(--warm))]/15 transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </>
          ) : restarting ? (
            <button
              onClick={() => onStop(camera.id)}
              title="Cancel restart"
              className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => onStart(camera.id)}
              title="Start"
              className="p-1.5 rounded text-muted-foreground hover:text-[hsl(var(--good))] hover:bg-[hsl(var(--good))]/15 transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onOpenLogs(camera.id)}
            title="Logs"
            className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/15 transition-colors"
          >
            <ScrollText className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onToggleEnabled(camera.id, !camera.config.enabled)}
            title={
              camera.config.enabled
                ? 'Auto-start at boot is ON — click to disable'
                : 'Auto-start at boot is OFF — click to enable'
            }
            className={cn(
              'p-1.5 rounded transition-colors',
              camera.config.enabled
                ? 'text-muted-foreground hover:text-[hsl(var(--good))] hover:bg-[hsl(var(--good))]/15'
                : 'text-[hsl(var(--warm))]/85 hover:text-[hsl(var(--warm))] hover:bg-[hsl(var(--warm))]/15',
            )}
          >
            {camera.config.enabled ? (
              <Power className="w-3.5 h-3.5" />
            ) : (
              <PowerOff className="w-3.5 h-3.5" />
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onSelect={() => onEdit(camera.id)}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  if (!confirming) {
                    e.preventDefault();
                    setConfirming(true);
                    setTimeout(() => setConfirming(false), 3000);
                    return;
                  }
                  onDelete(camera.id);
                  setConfirming(false);
                }}
                className={
                  confirming
                    ? 'bg-destructive/15 text-destructive focus:bg-destructive/20'
                    : 'text-destructive focus:bg-destructive/10'
                }
              >
                {confirming ? 'Confirm delete?' : 'Delete'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
}

function cameraRowEqual(prev: CameraRowProps, next: CameraRowProps): boolean {
  const a = prev.camera;
  const b = next.camera;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.started_at === b.started_at &&
    a.next_restart_at === b.next_restart_at &&
    a.pid === b.pid &&
    a.config.name === b.config.name &&
    a.config.enabled === b.config.enabled &&
    a.config.mac === b.config.mac &&
    a.config.ip === b.config.ip &&
    a.config.model === b.config.model &&
    prev.onStart === next.onStart &&
    prev.onStop === next.onStop &&
    prev.onRestart === next.onRestart &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete &&
    prev.onToggleEnabled === next.onToggleEnabled &&
    prev.onOpenLogs === next.onOpenLogs
  );
}

const CameraRow = memo(CameraRowImpl, cameraRowEqual);
export default CameraRow;
