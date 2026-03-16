import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

interface LogViewerProps {
  cameraId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function LogViewer({ cameraId, isOpen, onClose }: LogViewerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-white font-medium">Logs - {cameraId}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div className="flex-1 overflow-auto p-4 font-mono text-sm text-gray-300 bg-black/30">
          {logs.length === 0 ? (
            <p className="text-gray-500 italic">No logs available</p>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">
                {line}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
