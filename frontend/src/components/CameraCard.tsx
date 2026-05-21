import { useEffect, useState } from 'react';
import { MoreHorizontal, Cctv, Play, Square, RotateCw, ScrollText } from 'lucide-react';
import type { CameraStatus } from '../types';
import { snapshotUrl } from '../api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import StatusBadge from './StatusBadge';
import LogViewer from './LogViewer';

interface CameraCardProps {
  camera: CameraStatus;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatUptime(seconds: number | null): string {
  if (seconds == null) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const TYPE_COLORS: Record<string, string> = {
  rtsp: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  frigate: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  mosaic: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  amcrest: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  dahua: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  lorex: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  hikvision: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  reolink: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  reolink_nvr: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  tapo: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
};

const TYPE_LABEL: Record<string, string> = { mosaic: 'gridfusion' };

/** Live-ish snapshot thumbnail (cheap JPEG refresh) shown at the top of a card. */
function Thumb({ camera }: { camera: CameraStatus }) {
  const [bust, setBust] = useState(() => Date.now());
  const [ok, setOk] = useState(true);
  const running = camera.status === 'running';

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setBust(Date.now()), 6000);
    return () => clearInterval(t);
  }, [running]);

  return (
    <div className="relative aspect-video bg-black/70 overflow-hidden border-b border-border">
      {running && ok ? (
        <img
          src={snapshotUrl(camera.id, bust)}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setOk(false)}
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Cctv className="w-7 h-7 text-muted-foreground/40" />
        </div>
      )}
      {running && (
        <span className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/70">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-signal" />
          <span className="text-[10px] font-data text-white/90">LIVE</span>
        </span>
      )}
    </div>
  );
}

export default function CameraCard({ camera, onStart, onStop, onRestart, onEdit, onDelete }: CameraCardProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const config = camera.config;
  const typeColor = TYPE_COLORS[config.type] ?? 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30';
  const isRunning = camera.status === 'running';

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
      <Card className="overflow-hidden border-border bg-card/70 hover:border-primary/30 transition-colors p-0 gap-0">
        <Thumb camera={camera} />

        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground truncate leading-tight">{config.name || 'Unnamed'}</h3>
            <StatusBadge status={camera.status} />
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${typeColor} font-data text-[10px] uppercase tracking-wide`}>
              {TYPE_LABEL[config.type] ?? config.type}
            </Badge>
            {camera.uptime != null && (
              <span className="text-xs text-muted-foreground font-data">{formatUptime(camera.uptime)}</span>
            )}
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">MAC</dt>
            <dd className="text-foreground/90 font-data truncate text-right">{config.mac || '—'}</dd>
            {config.ip ? (
              <>
                <dt className="text-muted-foreground">IP</dt>
                <dd className="text-foreground/90 font-data text-right">{config.ip}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Model</dt>
            <dd className="text-foreground/90 truncate text-right">{config.model || '—'}</dd>
          </dl>

          {camera.error_message && (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-2.5 py-2 line-clamp-3">
              {camera.error_message}
            </div>
          )}

          {camera.status === 'restarting' && (
            <div className="text-xs text-yellow-300 font-data">
              restart attempt {camera.restart_attempt}
              {camera.next_restart_at && (
                <> · {Math.max(0, Math.ceil(camera.next_restart_at - Date.now() / 1000))}s</>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-0.5">
            {isRunning ? (
              <>
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs text-red-300 border-red-600/30 hover:bg-red-600/10" onClick={() => onStop(camera.id)}>
                  <Square className="w-3.5 h-3.5 mr-1" /> Stop
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs text-yellow-300 border-yellow-600/30 hover:bg-yellow-600/10" onClick={() => onRestart(camera.id)}>
                  <RotateCw className="w-3.5 h-3.5 mr-1" /> Restart
                </Button>
              </>
            ) : camera.status === 'restarting' ? (
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs text-red-300 border-red-600/30 hover:bg-red-600/10" onClick={() => onStop(camera.id)}>
                Cancel restart
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="flex-1 h-8 text-xs text-emerald-300 border-emerald-600/30 hover:bg-emerald-600/10" onClick={() => onStart(camera.id)}>
                <Play className="w-3.5 h-3.5 mr-1" /> Start
              </Button>
            )}

            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowLogs(true)} title="Logs">
              <ScrollText className="w-3.5 h-3.5" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onSelect={() => onEdit(camera.id)}>Edit</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={handleDeleteSelect}
                  className={confirming ? 'bg-red-500/15 text-red-300 focus:bg-red-500/20' : 'text-red-300 focus:bg-red-500/10'}
                >
                  {confirming ? 'Confirm delete?' : 'Delete'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

      <LogViewer cameraId={camera.id} cameraName={config.name || 'Unnamed'} isOpen={showLogs} onClose={() => setShowLogs(false)} />
    </>
  );
}
