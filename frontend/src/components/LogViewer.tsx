import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { LogEntry } from '../types';

interface LogViewerProps {
  cameraId: string;
  isOpen: boolean;
  onClose: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG: 'text-gray-400',
  INFO: 'text-blue-400',
  WARNING: 'text-yellow-400',
  ERROR: 'text-red-400',
};

const LEVEL_BG: Record<string, string> = {
  DEBUG: '',
  INFO: '',
  WARNING: 'bg-yellow-500/5',
  ERROR: 'bg-red-500/10',
};

type Tab = 'logs' | 'diagnostics';

export default function LogViewer({ cameraId, isOpen, onClose }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [search, setSearch] = useState('');
  const [levels, setLevels] = useState<Set<string>>(new Set(['DEBUG', 'INFO', 'WARNING', 'ERROR']));
  const [loggerFilter, setLoggerFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [tab, setTab] = useState<Tab>('logs');
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const fetchLogs = () => {
      api.getCameraLogs(cameraId).then((data) => setLogs(data.logs)).catch(() => {});
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
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

  const diagnostics = useMemo(() => {
    let mqttConnected = false;
    let protectConnected = false;
    let smartDetectStarts = 0;
    let smartDetectUpdates = 0;
    let smartDetectStops = 0;
    let motionEvents = 0;
    let errors = 0;
    let warnings = 0;
    let lastTimestamp = '';
    const errorMessages: Record<string, number> = {};

    for (const log of logs) {
      if (log.timestamp) lastTimestamp = log.timestamp;
      if (log.level === 'ERROR') {
        errors++;
        const key = log.message.slice(0, 100);
        errorMessages[key] = (errorMessages[key] || 0) + 1;
      }
      if (log.level === 'WARNING') warnings++;

      const msg = log.message.toLowerCase();
      if (msg.includes('connected to') && log.logger !== 'CameraManager') {
        if (msg.includes('mqtt') || log.logger === 'FrigateCam') mqttConnected = true;
        else protectConnected = true;
      }
      if (msg.includes('connection') && msg.includes('closed')) protectConnected = false;
      if (msg.includes('starting') && msg.includes('smart event')) smartDetectStarts++;
      if (msg.includes('updating smart detect') || msg.includes('moving update')) smartDetectUpdates++;
      if (msg.includes('ending') && msg.includes('smart event')) smartDetectStops++;
      if (msg.includes('motion event')) motionEvents++;
    }

    return {
      mqttConnected, protectConnected,
      smartDetectStarts, smartDetectUpdates, smartDetectStops,
      motionEvents, errors, warnings, lastTimestamp,
      errorMessages: Object.entries(errorMessages).sort((a, b) => b[1] - a[1]).slice(0, 10),
    };
  }, [logs]);

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
            <h3 className="text-white font-medium">Camera: {cameraId}</h3>
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
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {tab === 'logs' && (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-wrap">
              {/* Level filters */}
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

              {/* Logger filter */}
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

              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search logs..."
                className="flex-1 min-w-[150px] bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500"
              />

              {/* Actions */}
              <div className="flex gap-1">
                <button
                  onClick={() => setAutoScroll((v) => !v)}
                  className={`px-2 py-1 text-xs rounded border ${
                    autoScroll ? 'border-green-600 text-green-400' : 'border-gray-700 text-gray-500'
                  }`}
                  title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
                >
                  {autoScroll ? 'Auto-scroll' : 'Scroll paused'}
                </button>
                <button
                  onClick={handleCopy}
                  className="px-2 py-1 text-xs rounded border border-gray-700 text-gray-400 hover:text-white"
                  title="Copy visible logs"
                >
                  Copy
                </button>
              </div>

              {/* Count */}
              <span className="text-xs text-gray-500">
                {filteredLogs.length}/{logs.length}
              </span>
            </div>

            {/* Log content */}
            <div ref={scrollContainerRef} className="flex-1 overflow-auto p-2 font-mono text-xs bg-black/30">
              {filteredLogs.length === 0 ? (
                <p className="text-gray-500 italic p-2">
                  {logs.length === 0 ? 'No logs available' : 'No logs match current filters'}
                </p>
              ) : (
                filteredLogs.map((log, i) => {
                  const levelColor = LEVEL_COLORS[log.level] || 'text-gray-300';
                  const bg = LEVEL_BG[log.level] || '';
                  return (
                    <div key={i} className={`${bg} px-2 py-0.5 hover:bg-gray-800/50 whitespace-pre-wrap break-all leading-relaxed`}>
                      {log.timestamp && (
                        <span className="text-gray-600 mr-2">{log.timestamp}</span>
                      )}
                      {log.logger && (
                        <span className="text-purple-400 mr-2">{log.logger}</span>
                      )}
                      <span className={`${levelColor} font-bold mr-2`}>{log.level.padEnd(7)}</span>
                      <span className="text-gray-200">
                        {search ? highlightSearch(log.message, search) : log.message}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={bottomRef} />
            </div>
          </>
        )}

        {tab === 'diagnostics' && (
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Connection Status */}
            <div className="grid grid-cols-2 gap-4">
              <StatusCard
                title="UniFi Protect"
                connected={diagnostics.protectConnected}
                detail={diagnostics.lastTimestamp ? `Last activity: ${diagnostics.lastTimestamp}` : 'No activity'}
              />
              <StatusCard
                title="MQTT Broker"
                connected={diagnostics.mqttConnected}
              />
            </div>

            {/* Event Counters */}
            <div className="border border-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Event Counters</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Counter label="Motion Events" value={diagnostics.motionEvents} />
                <Counter label="Detection Starts" value={diagnostics.smartDetectStarts} color="text-green-400" />
                <Counter label="Detection Updates" value={diagnostics.smartDetectUpdates} color="text-blue-400" />
                <Counter label="Detection Ends" value={diagnostics.smartDetectStops} color="text-yellow-400" />
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Log Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Total entries</span>
                    <span className="text-gray-200">{logs.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-400">Warnings</span>
                    <span className="text-yellow-400">{diagnostics.warnings}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-400">Errors</span>
                    <span className="text-red-400">{diagnostics.errors}</span>
                  </div>
                </div>
              </div>

              {/* Error Summary */}
              <div className="border border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-2">Top Errors</h4>
                {diagnostics.errorMessages.length === 0 ? (
                  <p className="text-gray-500 text-sm italic">No errors</p>
                ) : (
                  <div className="space-y-1 text-xs max-h-32 overflow-auto">
                    {diagnostics.errorMessages.map(([msg, count], i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-red-400 shrink-0">x{count}</span>
                        <span className="text-gray-400 truncate">{msg}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
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

function Counter({ label, value, color = 'text-gray-200' }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
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
