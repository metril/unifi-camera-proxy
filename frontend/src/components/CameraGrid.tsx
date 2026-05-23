import type { ReactNode } from 'react';
import { Cctv, Plus } from 'lucide-react';
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
      <div className="relative min-h-[55vh] grid place-items-center animate-rise">
        <div className="absolute inset-0 [background:radial-gradient(circle_at_center,hsl(var(--signal)/0.06),transparent_60%)] pointer-events-none" />
        <div className="relative text-center space-y-4 max-w-sm">
          <div className="mx-auto w-20 h-20 rounded-2xl border border-border bg-card/40 grid place-items-center backdrop-blur-sm shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)] text-muted-foreground/70">
            {emptyIcon ?? <Cctv className="w-9 h-9" />}
          </div>
          <div>
            <div className="label-eyebrow text-primary/70 mb-1">empty</div>
            <p className="text-foreground font-medium">{emptyTitle}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{emptyHint}</p>
          </div>
          <Button onClick={onAdd} className="gap-1.5">
            <Plus className="w-4 h-4" /> {addLabel}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-rise-stagger">
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
