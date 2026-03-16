interface StatusBadgeProps {
  status: 'stopped' | 'running' | 'error';
}

const statusConfig = {
  running: { color: 'bg-green-500', label: 'Running' },
  stopped: { color: 'bg-gray-500', label: 'Stopped' },
  error: { color: 'bg-red-500', label: 'Error' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.stopped;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${config.color}`} />
      <span className="text-gray-300">{config.label}</span>
    </span>
  );
}
