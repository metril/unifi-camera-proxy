import { useState } from 'react';
import type { CameraStatus } from '../types';
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
  rtsp: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  frigate: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  amcrest: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  dahua: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  lorex: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  hikvision: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  reolink: 'bg-green-500/20 text-green-400 border-green-500/30',
  reolink_nvr: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  tapo: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
};

export default function CameraCard({ camera, onStart, onStop, onRestart, onEdit, onDelete }: CameraCardProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const config = camera.config;
  const typeColor = TYPE_COLORS[config.type] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';

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
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium truncate">{config.name || 'Unnamed'}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${typeColor}`}>
                {config.type}
              </span>
              <StatusBadge status={camera.status} />
            </div>
          </div>
        </div>

        <div className="space-y-1 text-sm text-gray-400 mb-4">
          <div className="flex justify-between">
            <span>MAC</span>
            <span className="text-gray-300 font-mono text-xs">{config.mac || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span>IP</span>
            <span className="text-gray-300">{config.ip || 'N/A'}</span>
          </div>
          <div className="flex justify-between">
            <span>Model</span>
            <span className="text-gray-300">{config.model}</span>
          </div>
          {camera.uptime != null && (
            <div className="flex justify-between">
              <span>Uptime</span>
              <span className="text-gray-300">{formatUptime(camera.uptime)}</span>
            </div>
          )}
          {camera.pid != null && (
            <div className="flex justify-between">
              <span>PID</span>
              <span className="text-gray-300 font-mono text-xs">{camera.pid}</span>
            </div>
          )}
          {camera.error_message && (
            <div className="mt-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded p-2">
              {camera.error_message}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {camera.status === 'running' ? (
            <>
              <button
                onClick={() => onStop(camera.id)}
                className="flex-1 px-3 py-1.5 text-xs bg-red-600/20 text-red-400 border border-red-600/30 rounded hover:bg-red-600/30 transition-colors"
              >
                Stop
              </button>
              <button
                onClick={() => onRestart(camera.id)}
                className="flex-1 px-3 py-1.5 text-xs bg-yellow-600/20 text-yellow-400 border border-yellow-600/30 rounded hover:bg-yellow-600/30 transition-colors"
              >
                Restart
              </button>
            </>
          ) : (
            <button
              onClick={() => onStart(camera.id)}
              className="flex-1 px-3 py-1.5 text-xs bg-green-600/20 text-green-400 border border-green-600/30 rounded hover:bg-green-600/30 transition-colors"
            >
              Start
            </button>
          )}
          <button
            onClick={() => setShowLogs(true)}
            className="px-3 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
          >
            Logs
          </button>
          <button
            onClick={() => onEdit(camera.id)}
            className="px-3 py-1.5 text-xs bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              confirming
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:text-red-400 hover:bg-gray-600'
            }`}
          >
            {confirming ? 'Confirm?' : 'Delete'}
          </button>
        </div>
      </div>

      <LogViewer cameraId={camera.id} isOpen={showLogs} onClose={() => setShowLogs(false)} />
    </>
  );
}
