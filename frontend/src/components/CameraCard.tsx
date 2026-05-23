import { useEffect, useState } from 'react';
import {
  MoreHorizontal,
  Cctv,
  Play,
  Square,
  RotateCw,
  ScrollText,
  AlertTriangle,
  Activity,
  Power,
  PowerOff,
} from 'lucide-react';
import type { CameraStatus } from '../types';
import { snapshotUrl } from '../api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import LogViewer from './LogViewer';
import { cn } from '@/lib/utils';

interface CameraCardProps {
  camera: CameraStatus;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
}

function formatUptime(seconds: number | null): string {
  if (seconds == null) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

const TYPE_LABEL: Record<string, string> = { mosaic: 'gridfusion' };

type StatusKey = CameraStatus['status'];

const STATUS_STYLE: Record<StatusKey, { chip: string; bar: string; label: string }> = {
  running: { chip: 'chip-good', bar: 'bg-[hsl(var(--good))]', label: 'live' },
  error: { chip: 'chip-danger', bar: 'bg-destructive', label: 'error' },
  restarting: { chip: 'chip-warm', bar: 'bg-[hsl(var(--warm))]', label: 'restart' },
  stopped: { chip: 'chip-muted', bar: 'bg-muted', label: 'idle' },
};

/** Snapshot thumbnail with hover-reveal action toolbar overlaid. */
function Thumb({
  camera,
  isRunning,
  onStart,
  onStop,
  onRestart,
  onLogs,
  onToggleEnabled,
}: {
  camera: CameraStatus;
  isRunning: boolean;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onLogs: () => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
}) {
  const [bust, setBust] = useState(() => Date.now());
  const [ok, setOk] = useState(true);
  const restarting = camera.status === 'restarting';

  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => setBust(Date.now()), 6000);
    return () => clearInterval(t);
  }, [isRunning]);

  const restartCountdown =
    restarting && camera.next_restart_at != null
      ? Math.max(0, Math.ceil(camera.next_restart_at - Date.now() / 1000))
      : null;

  return (
    <div className="relative aspect-video bg-black/70 overflow-hidden border-b border-border group/thumb">
      {isRunning && ok ? (
        <img
          src={snapshotUrl(camera.id, bust)}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setOk(false)}
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(circle_at_center,hsl(var(--card)),transparent_70%)]">
          {camera.status === 'error' ? (
            <AlertTriangle className="w-7 h-7 text-destructive/70" />
          ) : restarting ? (
            <RotateCw className="w-7 h-7 text-[hsl(var(--warm))]/70 animate-spin" />
          ) : (
            <Cctv className="w-7 h-7 text-muted-foreground/40" />
          )}
        </div>
      )}

      {/* Status chip — always visible, top-left. */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5">
        <span
          className={cn(
            'chip !py-0 !px-1.5',
            STATUS_STYLE[camera.status].chip,
            isRunning && 'animate-tick',
          )}
        >
          {isRunning && <span className="w-1 h-1 rounded-full bg-current animate-signal" />}
          {STATUS_STYLE[camera.status].label}
        </span>
        {restartCountdown != null && (
          <span className="chip chip-warm !py-0 !px-1.5 font-data tabular-nums">
            {restartCountdown}s
          </span>
        )}
      </div>

      {/* Hover toolbar — slides up over the thumbnail. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 px-2 py-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent opacity-0 translate-y-1 group-hover/thumb:opacity-100 group-hover/thumb:translate-y-0 transition-all pointer-events-auto">
        {isRunning ? (
          <>
            <button
              onClick={() => onStop(camera.id)}
              title="Stop"
              className="p-1.5 rounded text-white/85 hover:text-destructive hover:bg-destructive/15 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onRestart(camera.id)}
              title="Restart"
              className="p-1.5 rounded text-white/85 hover:text-[hsl(var(--warm))] hover:bg-[hsl(var(--warm))]/15 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </>
        ) : restarting ? (
          <button
            onClick={() => onStop(camera.id)}
            title="Cancel restart"
            className="p-1.5 rounded text-white/85 hover:text-destructive hover:bg-destructive/15 transition-colors"
          >
            <Square className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={() => onStart(camera.id)}
            title="Start"
            className="p-1.5 rounded text-white/85 hover:text-[hsl(var(--good))] hover:bg-[hsl(var(--good))]/15 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onLogs}
          title="Logs"
          className="p-1.5 rounded text-white/85 hover:text-primary hover:bg-primary/15 transition-colors"
        >
          <ScrollText className="w-3.5 h-3.5" />
        </button>
        <span className="w-px h-4 bg-white/15 mx-0.5" aria-hidden />
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
              ? 'text-white/85 hover:text-[hsl(var(--good))] hover:bg-[hsl(var(--good))]/15'
              : 'text-muted-foreground hover:text-[hsl(var(--warm))] hover:bg-[hsl(var(--warm))]/15',
          )}
        >
          {camera.config.enabled ? (
            <Power className="w-3.5 h-3.5" />
          ) : (
            <PowerOff className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* Uptime ticker bottom-right when running */}
      {isRunning && camera.uptime != null && (
        <div className="absolute bottom-1.5 left-2 flex items-center gap-1 opacity-0 group-hover/thumb:opacity-0 pointer-events-none">
          {/* hidden when hover toolbar is up — uptime moves to footer line below */}
          <Activity className="w-3 h-3 text-primary" />
          <span className="font-data text-[0.6875rem] text-white/80 tabular-nums">
            {formatUptime(camera.uptime)}
          </span>
        </div>
      )}
    </div>
  );
}

export default function CameraCard({
  camera,
  onStart,
  onStop,
  onRestart,
  onEdit,
  onDelete,
  onToggleEnabled,
}: CameraCardProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const config = camera.config;
  const isRunning = camera.status === 'running';
  const status = STATUS_STYLE[camera.status];
  const disabled = config.enabled === false;

  const handleDeleteSelect = (e: Event) => {
    if (!confirming) {
      e.preventDefault();
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    onDelete(camera.id);
    setConfirming(false);
  };

  return (
    <>
      <div
        className={cn(
          'surface-panel rounded-lg overflow-hidden transition-colors relative',
          disabled ? 'opacity-80 hover:border-[hsl(var(--warm))]/40' : 'hover:border-primary/30',
        )}
      >
        {/* Status accent — a 1px top stripe in the live color. Dimmed when
            the camera is disabled so the row reads "ignored at boot". */}
        <div
          className={cn(
            'absolute inset-x-0 top-0 h-px',
            disabled ? 'bg-muted' : status.bar,
            disabled ? 'opacity-40' : 'opacity-70',
          )}
        />

        <Thumb
          camera={camera}
          isRunning={isRunning}
          onStart={onStart}
          onStop={onStop}
          onRestart={onRestart}
          onLogs={() => setShowLogs(true)}
          onToggleEnabled={onToggleEnabled}
        />

        <div className="p-3.5 space-y-2.5">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-[0.9375rem] font-semibold text-foreground truncate leading-tight">
                {config.name || 'Unnamed'}
              </div>
              <div className="label-hud text-muted-foreground mt-0.5">
                {TYPE_LABEL[config.type] ?? config.type}
                {isRunning && camera.uptime != null && (
                  <span className="ml-2 text-foreground/70 font-data tabular-nums">
                    · {formatUptime(camera.uptime)}
                  </span>
                )}
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onSelect={() => onEdit(camera.id)}>Edit</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={handleDeleteSelect}
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

          {/* Compact data row — replaces the old DL table. */}
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[0.6875rem] font-data text-muted-foreground tabular-nums">
            {disabled && (
              <span
                className="chip chip-warm !py-0 !px-1.5"
                title="This camera will be skipped on container boot. Hover the thumbnail to re-enable."
              >
                auto-off
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <span className="text-muted-foreground/60 label-hud">mac</span>
              <span className="text-foreground/80">{config.mac || '—'}</span>
            </span>
            {config.ip && (
              <span className="inline-flex items-center gap-1">
                <span className="text-muted-foreground/60 label-hud">ip</span>
                <span className="text-foreground/80">{config.ip}</span>
              </span>
            )}
            {config.model && (
              <span
                className="inline-flex items-center gap-1 truncate max-w-[14rem]"
                title={config.model}
              >
                <span className="text-muted-foreground/60 label-hud">model</span>
                <span className="text-foreground/80 truncate">{config.model}</span>
              </span>
            )}
          </div>

          {camera.error_message && (
            <button
              type="button"
              onClick={() => setShowLogs(true)}
              title="Open logs"
              className="w-full text-left text-[0.6875rem] text-destructive/90 bg-destructive/10 border border-destructive/25 hover:bg-destructive/15 hover:border-destructive/40 transition-colors rounded-md px-2.5 py-1.5 line-clamp-3 font-data cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-destructive/50"
            >
              {camera.error_message}
            </button>
          )}
        </div>
      </div>

      <LogViewer
        cameraId={camera.id}
        cameraName={config.name || 'Unnamed'}
        isOpen={showLogs}
        onClose={() => setShowLogs(false)}
      />
    </>
  );
}
