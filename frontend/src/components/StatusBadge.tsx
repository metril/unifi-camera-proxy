import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: string;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  running: { label: 'Running', className: 'bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/15' },
  stopped: { label: 'Stopped', className: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30 hover:bg-zinc-500/15' },
  error:   { label: 'Error',   className: 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/15' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { label, className } = STATUS_MAP[status] ?? STATUS_MAP.stopped;
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  );
}
