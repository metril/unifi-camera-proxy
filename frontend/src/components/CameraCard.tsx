import { useState } from 'react';
import type { CameraStatus } from '../types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import StatusBadge from './StatusBadge';
import LogViewer from './LogViewer';

interface CameraCardProps {
  camera: CameraStatus;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSyncName: (id: string) => void;
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
  rtsp:        'bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/15',
  frigate:     'bg-purple-500/15 text-purple-400 border-purple-500/30 hover:bg-purple-500/15',
  amcrest:     'bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/15',
  dahua:       'bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/15',
  lorex:       'bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/15',
  hikvision:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/15',
  reolink:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15',
  reolink_nvr: 'bg-teal-500/15 text-teal-400 border-teal-500/30 hover:bg-teal-500/15',
  tapo:        'bg-pink-500/15 text-pink-400 border-pink-500/30 hover:bg-pink-500/15',
};

export default function CameraCard({ camera, onStart, onStop, onRestart, onEdit, onDelete, onSyncName }: CameraCardProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSyncName = async () => {
    setSyncing(true);
    try {
      await onSyncName(camera.id);
    } finally {
      setSyncing(false);
    }
  };

  const config = camera.config;
  const typeColor = TYPE_COLORS[config.type] ?? 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30 hover:bg-zinc-500/15';

  const handleDelete = () => {
    if (confirming) {
      onDelete(camera.id);
      setConfirming(false);
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <>
      <Card className="border-border bg-card hover:border-border transition-colors">
        <CardHeader className="p-4 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground truncate">{config.name || 'Unnamed'}</h3>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="outline" className={typeColor}>{config.type}</Badge>
                <StatusBadge status={camera.status} />
              </div>
            </div>
          </div>
        </CardHeader>

        <Separator className="opacity-50" />

        <CardContent className="p-4 pt-3 space-y-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">MAC</dt>
            <dd className="text-foreground font-mono text-xs truncate">{config.mac || '—'}</dd>
            <dt className="text-muted-foreground">IP</dt>
            <dd className="text-foreground">{config.ip || '—'}</dd>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="text-foreground truncate">{config.model || '—'}</dd>
            {camera.uptime != null && (
              <>
                <dt className="text-muted-foreground">Uptime</dt>
                <dd className="text-foreground">{formatUptime(camera.uptime)}</dd>
              </>
            )}
            {camera.pid != null && (
              <>
                <dt className="text-muted-foreground">PID</dt>
                <dd className="text-foreground font-mono text-xs">{camera.pid}</dd>
              </>
            )}
            {camera.status === 'restarting' && (
              <>
                <dt className="text-muted-foreground">Restart</dt>
                <dd className="text-yellow-400">
                  Attempt {camera.restart_attempt}
                  {camera.next_restart_at && (
                    <> &mdash; in {Math.max(0, Math.ceil(camera.next_restart_at - Date.now() / 1000))}s</>
                  )}
                </dd>
              </>
            )}
          </dl>

          {camera.error_message && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              {camera.error_message}
            </div>
          )}

          <div className="flex gap-2 flex-wrap pt-1">
            {camera.status === 'running' ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => onStop(camera.id)}
                >
                  Stop
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8 text-xs text-yellow-400 border-yellow-600/30 hover:bg-yellow-600/10 hover:text-yellow-300"
                  onClick={() => onRestart(camera.id)}
                >
                  Restart
                </Button>
              </>
            ) : camera.status === 'restarting' ? (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs text-red-400 border-red-600/30 hover:bg-red-600/10 hover:text-red-300"
                onClick={() => onStop(camera.id)}
              >
                Cancel Restart
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs text-green-400 border-green-600/30 hover:bg-green-600/10 hover:text-green-300"
                onClick={() => onStart(camera.id)}
              >
                Start
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowLogs(true)}
            >
              Logs
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onEdit(camera.id)}
            >
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleSyncName}
              disabled={syncing || camera.status !== 'running'}
              title={
                camera.status !== 'running'
                  ? 'Camera must be running to sync name to Protect'
                  : 'Push the configured name to UniFi Protect'
              }
            >
              {syncing ? 'Syncing…' : 'Sync Name'}
            </Button>
            <Button
              variant={confirming ? 'destructive' : 'ghost'}
              size="sm"
              className="h-8 text-xs"
              onClick={handleDelete}
            >
              {confirming ? 'Confirm?' : 'Delete'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <LogViewer
        cameraId={camera.id}
        cameraName={config.name || 'Unnamed'}
        isOpen={showLogs}
        onClose={() => setShowLogs(false)}
      />
    </>
  );
}
