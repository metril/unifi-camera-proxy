import type { CameraStatus } from '../types';
import CameraCard from './CameraCard';

interface CameraGridProps {
  cameras: CameraStatus[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export default function CameraGrid({ cameras, onStart, onStop, onEdit, onDelete, onAdd }: CameraGridProps) {
  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <svg className="w-16 h-16 mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p className="text-lg mb-2">No cameras configured</p>
        <p className="text-sm mb-4">Add your first camera to get started</p>
        <button
          onClick={onAdd}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
        >
          Add Camera
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {cameras.map((camera) => (
        <CameraCard
          key={camera.id}
          camera={camera}
          onStart={onStart}
          onStop={onStop}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
