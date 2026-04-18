import type { CameraStatus } from '../types';
import { Button } from '@/components/ui/button';
import CameraCard from './CameraCard';

interface CameraGridProps {
  cameras: CameraStatus[];
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onSyncName: (id: string) => void;
  onAdd: () => void;
}

export default function CameraGrid({ cameras, onStart, onStop, onRestart, onEdit, onDelete, onSyncName, onAdd }: CameraGridProps) {
  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <svg className="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p className="text-lg font-medium mb-1 text-foreground">No cameras configured</p>
        <p className="text-sm mb-5">Add your first camera to get started</p>
        <Button onClick={onAdd}>Add Camera</Button>
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
          onRestart={onRestart}
          onEdit={onEdit}
          onDelete={onDelete}
          onSyncName={onSyncName}
        />
      ))}
    </div>
  );
}
