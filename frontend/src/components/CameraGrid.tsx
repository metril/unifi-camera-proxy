import type { ReactNode } from 'react';
import { Cctv } from 'lucide-react';
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
  onAdd: () => void;
  emptyTitle?: string;
  emptyHint?: string;
  addLabel?: string;
  emptyIcon?: ReactNode;
}

export default function CameraGrid({
  cameras,
  onStart,
  onStop,
  onRestart,
  onEdit,
  onDelete,
  onAdd,
  emptyTitle = 'No cameras configured',
  emptyHint = 'Add your first camera to get started',
  addLabel = 'Add Camera',
  emptyIcon,
}: CameraGridProps) {
  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <div className="mb-4 opacity-30">{emptyIcon ?? <Cctv className="w-14 h-14" />}</div>
        <p className="text-lg font-medium mb-1 text-foreground">{emptyTitle}</p>
        <p className="text-sm mb-5">{emptyHint}</p>
        <Button onClick={onAdd}>{addLabel}</Button>
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
        />
      ))}
    </div>
  );
}
