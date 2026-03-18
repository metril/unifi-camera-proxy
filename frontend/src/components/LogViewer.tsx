import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LogEntry } from '../types';

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
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/cameras/${cameraId}/ws`);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-5xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <h3 className="text-white font-medium">{cameraName}</h3>
            <div className="flex gap-1">
              <button
                onClick={() => setTab('logs')}
                className={`px-3 py-1 text-xs rounded ${tab === 'logs' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                Logs
              </button>
              <button
                onClick={() => setTab('diagnostics')}
                className={`px-3 py-1 text-xs rounded ${tab === 'diagnostics' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                Diagnostics
              </button>
            </div>
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-red-400'}`} title={wsConnected ? 'Live' : 'Disconnected'} />
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {tab === 'logs' && (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-wrap">
              <div className="flex gap-1">
                {(['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => toggleLevel(level)}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                      levels.has(level)
                        ? `${LEVEL_COLORS[level]} border-current opacity-100`
                        : 'text-gray-600 border-gray-700 opacity-50'
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
                  className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1"
                >
                  <option value="">All sources</option>
                  {loggers.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              )}

              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search logs..."
                className="flex-1 min-w-[150px] bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
              />

              <div className="flex gap-1">
                <button
                  onClick={() => setAutoScroll((v) => !v)}
                  className={`px-2 py-1 text-xs rounded border ${
                    autoScroll ? 'border-green-600 text-green-400' : 'border-gray-700 text-gray-500'
                  }`}
                >
                  {autoScroll ? 'Auto-scroll' : 'Scroll paused'}
                </button>
                <button
                  onClick={handleCopy}
                  className="px-2 py-1 text-xs rounded border border-gray-700 text-gray-400 hover:text-white"
                >
                  Copy
                </button>
              </div>

              <span className="text-xs text-gray-500">
                {filteredLogs.length}/{logs.length}
              </span>
            </div>

            {/* Log content */}
            <div className="flex-1 overflow-auto p-2 font-mono text-xs bg-black/30">
              {filteredLogs.length === 0 ? (
                <p className="text-gray-500 italic p-2">
                  {logs.length === 0 ? 'No logs available' : 'No logs match current filters'}
                </p>
              ) : (
                filteredLogs.map((log, i) => (
                  <div key={i} className={`${LEVEL_BG[log.level] || ''} px-2 py-0.5 hover:bg-gray-800/50 whitespace-pre-wrap break-all leading-relaxed`}>
                    {log.timestamp && <span className="text-gray-600 mr-2">{log.timestamp}</span>}
                    {log.logger && <span className="text-purple-400 mr-2">{log.logger}</span>}
                    <span className={`${LEVEL_COLORS[log.level] || 'text-gray-300'} font-bold mr-2`}>{log.level.padEnd(7)}</span>
                    <span className="text-gray-200">
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
              <div className="border border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Live Snapshot</h4>
                {snapshotError ? (
                  <p className="text-xs text-gray-500">Snapshot unavailable</p>
                ) : (
                  <img
                    src={`/api/cameras/${cameraId}/snapshot?_t=${snapshotKey}`}
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
            <div className={`border rounded-lg p-4 ${diagnostics.active_events && diagnostics.active_events.length > 0 ? 'border-green-600/30 bg-green-600/5' : 'border-gray-700'}`}>
              <h4 className={`text-sm font-medium mb-3 ${diagnostics.active_events && diagnostics.active_events.length > 0 ? 'text-green-400' : 'text-gray-300'}`}>
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
                            <span className="text-sm font-medium text-white capitalize">{evt.object_type}</span>
                            <span className="text-xs text-gray-400">{evt.confidence}%</span>
                            {evt.stationary && (
                              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">stationary</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">{formatDuration(evt.duration_sec)}</span>
                        </div>
                        {evt.bounding_box && (
                          <div className="text-xs text-gray-500 mt-1">
                            Box: [{evt.bounding_box.join(', ')}]
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No active detections</p>
              )}
            </div>

            {/* Recent Events */}
            {diagnostics.recent_events && diagnostics.recent_events.length > 0 && (
              <div className="border border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Recent Events ({diagnostics.recent_events.length})</h4>
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
                          <span className="text-gray-300 capitalize">{evt.object_type}</span>
                          <span className="text-gray-500">{evt.confidence}%</span>
                          <span className="text-gray-500">({formatDuration(evt.duration_sec)})</span>
                        </div>
                        <span className="text-gray-500">{formatDuration(evt.ended_ago_sec)} ago</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Event Counters */}
            <div className="border border-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Event Counters</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Counter label="Motion Active" value={diagnostics.motion_active ? 'YES' : 'NO'} color={diagnostics.motion_active ? 'text-green-400' : 'text-gray-500'} />
                <Counter label="Analytics Events" value={diagnostics.event_counts?.analytics_total ?? 0} />
                <Counter label="Active Detections" value={diagnostics.event_counts?.smart_detect_active ?? 0} color="text-green-400" />
                <Counter label="Total Detections" value={diagnostics.event_counts?.smart_detect_total ?? 0} color="text-blue-400" />
              </div>
            </div>

            {/* Stream Health */}
            {diagnostics.streams && (
              <div className="border border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Stream Health</h4>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(diagnostics.streams).map(([name, stream]) => (
                    <div key={name} className="bg-black/20 rounded px-3 py-2">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${stream.ffmpeg_running ? 'bg-green-400' : 'bg-gray-600'}`} />
                        <span className="text-sm text-gray-300 font-medium">{name}</span>
                      </div>
                      <span className="text-xs text-gray-500">{stream.resolution}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Frigate-specific */}
            {diagnostics.frigate && (
              <div className="border border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Frigate</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Camera</span>
                    <span className="text-gray-200">{diagnostics.frigate.camera}</span>
                  </div>
                  {diagnostics.frigate.http_url && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">HTTP API</span>
                      <span className="text-gray-200 text-xs">{diagnostics.frigate.http_url}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-400">Snapshot Source</span>
                    <span className="text-gray-200">{diagnostics.frigate.snapshot_source === 'http' ? 'HTTP API' : 'MQTT'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Active Frigate Events</span>
                    <span className="text-gray-200">{diagnostics.frigate.active_event_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Motion</span>
                    <span className={diagnostics.frigate.motion_active ? 'text-green-400' : 'text-gray-500'}>
                      {diagnostics.frigate.motion_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                {diagnostics.frigate.event_mappings && Object.keys(diagnostics.frigate.event_mappings).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <h5 className="text-xs font-medium text-gray-400 mb-2">Event Mappings (Frigate → UniFi)</h5>
                    <div className="space-y-1 text-xs font-mono">
                      {Object.entries(diagnostics.frigate.event_mappings).map(([fid, uid]) => (
                        <div key={fid} className="flex justify-between">
                          <span className="text-gray-500 truncate mr-2">{fid}</span>
                          <span className="text-gray-300">{String(uid)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {diagnostics.frigate.auto_detected && Object.keys(diagnostics.frigate.auto_detected).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <h5 className="text-xs font-medium text-gray-400 mb-2">Auto-Detected Settings</h5>
                    <div className="space-y-1 text-xs">
                      {Object.entries(diagnostics.frigate.auto_detected).map(([key, val]) => (
                        <div key={key} className="flex justify-between">
                          <span className="text-gray-500">{key.replace(/_/g, ' ')}</span>
                          <span className="text-gray-300">{String(val)}</span>
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
      </div>

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
    </div>
  );
}

function StatusCard({ title, connected, detail }: { title: string; connected: boolean; detail?: string }) {
  return (
    <div className={`border rounded-lg p-4 ${connected ? 'border-green-600/50 bg-green-600/5' : 'border-gray-700'}`}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-gray-600'}`} />
        <h4 className="text-sm font-medium text-gray-300">{title}</h4>
      </div>
      <p className={`text-xs ${connected ? 'text-green-400' : 'text-gray-500'}`}>
        {connected ? 'Connected' : 'Not connected'}
      </p>
      {detail && <p className="text-xs text-gray-500 mt-1">{detail}</p>}
    </div>
  );
}

function Counter({ label, value, color = 'text-gray-200' }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
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
