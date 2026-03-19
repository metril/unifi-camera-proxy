import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry } from '../types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface LogViewerProps {
  cameraId: string;
  cameraName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface Diagnostics {
  connected?: boolean;
  uptime?: number;
  streams?: Record<string, { resolution: string; ffmpeg_running: boolean }>;
  active_events?: Array<{
    event_id: number;
    object_type: string;
    confidence: number;
    duration_sec: number;
    bounding_box?: number[];
    stationary?: boolean;
  }>;
  recent_events?: Array<{
    event_id: number;
    object_type: string;
    confidence: number;
    duration_sec: number;
    ended_ago_sec: number;
  }>;
  event_counts?: {
    analytics_total: number;
    smart_detect_active: number;
    smart_detect_total: number;
  };
  mqtt?: { connected: boolean; host: string };
  frigate?: {
    camera: string;
    http_url?: string;
    active_event_count: number;
    motion_active: boolean;
    event_mappings: Record<string, number>;
    auto_detected?: Record<string, unknown>;
    snapshot_source?: string;
    event_snapshots?: Record<string, string>;
  };
  motion_active?: boolean;
  status?: string;
  error?: string;
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-gray-400',
  INFO: 'text-blue-400',
  WARNING: 'text-yellow-400',
  ERROR: 'text-red-400',
};

const LEVEL_BG: Record<string, string> = {
  WARNING: 'bg-yellow-500/5',
  ERROR: 'bg-red-500/10',
};

type Tab = 'logs' | 'diagnostics';

export default function LogViewer({ cameraId, cameraName, isOpen, onClose }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostics>({});
  const [search, setSearch] = useState('');
  const [levels, setLevels] = useState<Set<string>>(new Set(['DEBUG', 'INFO', 'WARNING', 'ERROR']));
  const [loggerFilter, setLoggerFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [tab, setTab] = useState<Tab>('logs');
  const [enlargedSnapshot, setEnlargedSnapshot] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [snapshotKey, setSnapshotKey] = useState(0);
  const [snapshotError, setSnapshotError] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!isOpen || !cameraId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('ui_token');
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/cameras/${cameraId}/ws${tokenParam}`);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'logs_batch') {
          setLogs(msg.data);
        } else if (msg.type === 'log') {
          setLogs((prev) => {
            const next = [...prev, msg.data];
            return next.length > 500 ? next.slice(-500) : next;
          });
        } else if (msg.type === 'diagnostics') {
          setDiagnostics(msg.data);
          setSnapshotKey((k) => k + 1);
          setSnapshotError(false);
        }
      } catch {}
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [cameraId, isOpen]);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const toggleLevel = useCallback((level: string) => {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }, []);

  const loggers = useMemo(() => {
    const set = new Set<string>();
    for (const log of logs) {
      if (log.logger) set.add(log.logger);
    }
    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (!levels.has(log.level)) return false;
      if (loggerFilter && log.logger !== loggerFilter) return false;
      if (search && !log.raw.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [logs, levels, loggerFilter, search]);

  const handleCopy = useCallback(() => {
    const text = filteredLogs.map((l) => l.raw).join('\n');
    navigator.clipboard.writeText(text);
  }, [filteredLogs]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-border pr-12">
          <DialogTitle className="text-foreground font-medium">{cameraName}</DialogTitle>
          <div className="flex gap-1">
            <Button
              variant={tab === 'logs' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setTab('logs')}
            >
              Logs
            </Button>
            <Button
              variant={tab === 'diagnostics' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => setTab('diagnostics')}
            >
              Diagnostics
            </Button>
          </div>
          <div
            className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'}`}
            title={wsConnected ? 'Live' : 'Disconnected'}
          />
        </div>

        {tab === 'logs' && (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-wrap">
              <div className="flex gap-1">
                {(['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => toggleLevel(level)}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                      levels.has(level)
                        ? `${LEVEL_COLORS[level]} border-current opacity-100`
                        : 'text-muted-foreground border-border opacity-50'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>

              {loggers.length > 1 && (
                <select
                  value={loggerFilter}
                  onChange={(e) => setLoggerFilter(e.target.value)}
                  className="bg-background border border-input text-muted-foreground text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">All sources</option>
                  {loggers.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              )}

              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search logs..."
                className="flex-1 min-w-[150px] h-7 text-xs"
              />

              <div className="flex gap-1">
                <button
                  onClick={() => setAutoScroll((v) => !v)}
                  className={`px-2 py-1 text-xs rounded border ${
                    autoScroll ? 'border-green-600 text-green-400' : 'border-border text-muted-foreground'
                  }`}
                >
                  {autoScroll ? 'Auto-scroll' : 'Scroll paused'}
                </button>
                <button
                  onClick={handleCopy}
                  className="px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:text-foreground"
                >
                  Copy
                </button>
              </div>

              <span className="text-xs text-muted-foreground">
                {filteredLogs.length}/{logs.length}
              </span>
            </div>

            {/* Log content */}
            <div className="flex-1 overflow-auto p-2 font-mono text-xs bg-black/30">
              {filteredLogs.length === 0 ? (
                <p className="text-muted-foreground italic p-2">
                  {logs.length === 0 ? 'No logs available' : 'No logs match current filters'}
                </p>
              ) : (
                filteredLogs.map((log, i) => (
                  <div key={i} className={`${LEVEL_BG[log.level] || ''} px-2 py-0.5 hover:bg-muted/20 whitespace-pre-wrap break-all leading-relaxed`}>
                    {log.timestamp && <span className="text-muted-foreground mr-2">{log.timestamp}</span>}
                    {log.logger && <span className="text-purple-400 mr-2">{log.logger}</span>}
                    <span className={`${LEVEL_COLORS[log.level] || 'text-foreground'} font-bold mr-2`}>{log.level.padEnd(7)}</span>
                    <span className="text-foreground">
                      {search ? highlightSearch(log.message, search) : log.message}
                    </span>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
          </>
        )}

        {tab === 'diagnostics' && (
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Live Snapshot */}
            {diagnostics.frigate && (
              <div className="border border-border rounded-lg p-4">
                <h4 className="text-sm font-medium text-foreground mb-3">Live Snapshot</h4>
                {snapshotError ? (
                  <p className="text-xs text-muted-foreground">Snapshot unavailable</p>
                ) : (
                  <img
                    src={`/api/cameras/${cameraId}/snapshot?_t=${snapshotKey}${localStorage.getItem('ui_token') ? `&token=${encodeURIComponent(localStorage.getItem('ui_token')!)}` : ''}`}
                    alt="Camera snapshot"
                    className="w-full max-w-md rounded bg-black"
                    onError={() => setSnapshotError(true)}
                  />
                )}
              </div>
            )}

            {/* Connection Status */}
            <div className="grid grid-cols-2 gap-4">
              <StatusCard
                title="UniFi Protect"
                connected={diagnostics.connected ?? false}
                detail={diagnostics.uptime ? `Uptime: ${formatDuration(diagnostics.uptime)}` : undefined}
              />
              <StatusCard
                title="MQTT Broker"
                connected={diagnostics.mqtt?.connected ?? false}
                detail={diagnostics.mqtt?.host}
              />
            </div>

            {/* Active Events */}
            <div className={`border rounded-lg p-4 ${diagnostics.active_events && diagnostics.active_events.length > 0 ? 'border-green-600/30 bg-green-600/5' : 'border-border'}`}>
              <h4 className={`text-sm font-medium mb-3 ${diagnostics.active_events && diagnostics.active_events.length > 0 ? 'text-green-400' : 'text-foreground'}`}>
                Active Detections {diagnostics.active_events ? `(${diagnostics.active_events.length})` : ''}
              </h4>
              {diagnostics.active_events && diagnostics.active_events.length > 0 ? (
                <div className="space-y-2">
                  {diagnostics.active_events.map((evt) => (
                    <div key={evt.event_id} className="bg-black/20 rounded px-3 py-2 flex gap-3">
                      {diagnostics.frigate?.event_snapshots?.[String(evt.event_id)] && (
                        <img
                          src={`data:image/jpeg;base64,${diagnostics.frigate.event_snapshots[String(evt.event_id)]}`}
                          alt={evt.object_type}
                          className="w-24 h-auto rounded flex-shrink-0 cursor-pointer hover:opacity-80"
                          onClick={() => setEnlargedSnapshot(diagnostics.frigate!.event_snapshots![String(evt.event_id)])}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-foreground capitalize">{evt.object_type}</span>
                            <span className="text-xs text-muted-foreground">{evt.confidence}%</span>
                            {evt.stationary && (
                              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">stationary</span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDuration(evt.duration_sec)}</span>
                        </div>
                        {evt.bounding_box && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Box: [{evt.bounding_box.join(', ')}]
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No active detections</p>
              )}
            </div>

            {/* Recent Events */}
            {diagnostics.recent_events && diagnostics.recent_events.length > 0 && (
              <div className="border border-border rounded-lg p-4">
                <h4 className="text-sm font-medium text-foreground mb-3">Recent Events ({diagnostics.recent_events.length})</h4>
                <div className="space-y-1">
                  {diagnostics.recent_events.map((evt) => (
                    <div key={evt.event_id} className="flex items-center gap-2 text-xs bg-black/20 rounded px-3 py-1.5">
                      {diagnostics.frigate?.event_snapshots?.[String(evt.event_id)] && (
                        <img
                          src={`data:image/jpeg;base64,${diagnostics.frigate.event_snapshots[String(evt.event_id)]}`}
                          alt={evt.object_type}
                          className="w-12 h-auto rounded flex-shrink-0 cursor-pointer hover:opacity-80"
                          onClick={() => setEnlargedSnapshot(diagnostics.frigate!.event_snapshots![String(evt.event_id)])}
                        />
                      )}
                      <div className="flex items-center justify-between flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground capitalize">{evt.object_type}</span>
                          <span className="text-muted-foreground">{evt.confidence}%</span>
                          <span className="text-muted-foreground">({formatDuration(evt.duration_sec)})</span>
                        </div>
                        <span className="text-muted-foreground">{formatDuration(evt.ended_ago_sec)} ago</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Event Counters */}
            <div className="border border-border rounded-lg p-4">
              <h4 className="text-sm font-medium text-foreground mb-3">Event Counters</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Counter label="Motion Active" value={diagnostics.motion_active ? 'YES' : 'NO'} color={diagnostics.motion_active ? 'text-green-400' : 'text-muted-foreground'} />
                <Counter label="Analytics Events" value={diagnostics.event_counts?.analytics_total ?? 0} />
                <Counter label="Active Detections" value={diagnostics.event_counts?.smart_detect_active ?? 0} color="text-green-400" />
                <Counter label="Total Detections" value={diagnostics.event_counts?.smart_detect_total ?? 0} color="text-blue-400" />
              </div>
            </div>

            {/* Stream Health */}
            {diagnostics.streams && (
              <div className="border border-border rounded-lg p-4">
                <h4 className="text-sm font-medium text-foreground mb-3">Stream Health</h4>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(diagnostics.streams).map(([name, stream]) => (
                    <div key={name} className="bg-black/20 rounded px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${stream.ffmpeg_running ? 'bg-green-400' : 'bg-muted-foreground'}`} />
                        <span className="text-sm text-foreground font-medium">{name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{stream.resolution}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Frigate-specific */}
            {diagnostics.frigate && (
              <div className="border border-border rounded-lg p-4">
                <h4 className="text-sm font-medium text-foreground mb-3">Frigate</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Camera</span>
                    <span className="text-foreground">{diagnostics.frigate.camera}</span>
                  </div>
                  {diagnostics.frigate.http_url && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">HTTP API</span>
                      <span className="text-foreground text-xs">{diagnostics.frigate.http_url}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Snapshot Source</span>
                    <span className="text-foreground">{diagnostics.frigate.snapshot_source === 'http' ? 'HTTP API' : 'MQTT'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active Frigate Events</span>
                    <span className="text-foreground">{diagnostics.frigate.active_event_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Motion</span>
                    <span className={diagnostics.frigate.motion_active ? 'text-green-400' : 'text-muted-foreground'}>
                      {diagnostics.frigate.motion_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                {diagnostics.frigate.event_mappings && Object.keys(diagnostics.frigate.event_mappings).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <h5 className="text-xs font-medium text-muted-foreground mb-2">Event Mappings (Frigate → UniFi)</h5>
                    <div className="space-y-1 text-xs font-mono">
                      {Object.entries(diagnostics.frigate.event_mappings).map(([fid, uid]) => (
                        <div key={fid} className="flex justify-between">
                          <span className="text-muted-foreground truncate mr-2">{fid}</span>
                          <span className="text-foreground">{String(uid)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {diagnostics.frigate.auto_detected && Object.keys(diagnostics.frigate.auto_detected).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <h5 className="text-xs font-medium text-muted-foreground mb-2">Auto-Detected Settings</h5>
                    <div className="space-y-1 text-xs">
                      {Object.entries(diagnostics.frigate.auto_detected).map(([key, val]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-muted-foreground">{key.replace(/_/g, ' ')}</span>
                          <span className="text-foreground">{String(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {diagnostics.error && (
              <div className="border border-red-600/30 bg-red-600/5 rounded-lg p-4">
                <p className="text-red-400 text-sm">{diagnostics.error}</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>

      {/* Snapshot lightbox */}
      {enlargedSnapshot && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-8"
          onClick={() => setEnlargedSnapshot(null)}
        >
          <img
            src={`data:image/jpeg;base64,${enlargedSnapshot}`}
            alt="Detection snapshot"
            className="max-w-lg max-h-[70vh] rounded-lg shadow-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Dialog>
  );
}

function StatusCard({ title, connected, detail }: { title: string; connected: boolean; detail?: string }) {
  return (
    <div className={`border rounded-lg p-4 ${connected ? 'border-green-600/50 bg-green-600/5' : 'border-border'}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-muted-foreground'}`} />
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
      </div>
      <p className={`text-xs ${connected ? 'text-green-400' : 'text-muted-foreground'}`}>
        {connected ? 'Connected' : 'Not connected'}
      </p>
      {detail && <p className="text-xs text-muted-foreground mt-1">{detail}</p>}
    </div>
  );
}

function Counter({ label, value, color = 'text-foreground' }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function highlightSearch(text: string, search: string): React.ReactNode {
  if (!search) return text;
  const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === search.toLowerCase()
      ? <mark key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">{part}</mark>
      : part
  );
}
