import { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ToastMessage {
  id: number;
  text: string;
  type: 'error' | 'success' | 'info';
}

interface ToastProps {
  messages: ToastMessage[];
  onDismiss: (id: number) => void;
}

const STYLE: Record<ToastMessage['type'], { stripe: string; chip: string; icon: typeof Info; kind: string }> = {
  success: {
    stripe: 'bg-[hsl(var(--good))]',
    chip: 'text-[hsl(var(--good))]',
    icon: CheckCircle2,
    kind: 'ok',
  },
  error: {
    stripe: 'bg-destructive',
    chip: 'text-destructive',
    icon: AlertTriangle,
    kind: 'error',
  },
  info: {
    stripe: 'bg-primary',
    chip: 'text-primary',
    icon: Info,
    kind: 'info',
  },
};

export default function Toast({ messages, onDismiss }: ToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
      {messages.map((msg) => (
        <ToastItem key={msg.id} message={msg} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ message, onDismiss }: { message: ToastMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(message.id), 5000);
    return () => clearTimeout(timer);
  }, [message.id, onDismiss]);

  const style = STYLE[message.type];
  const Icon = style.icon;

  return (
    <div
      role="status"
      className="pointer-events-auto relative surface-panel rounded-md overflow-hidden text-sm text-foreground animate-rise cursor-pointer pl-3 pr-2 py-2.5 flex items-start gap-2.5 min-w-[18rem]"
      onClick={() => onDismiss(message.id)}
    >
      {/* status stripe on the left edge */}
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-0.5', style.stripe, 'opacity-80')} />
      <Icon className={cn('w-4 h-4 mt-px shrink-0', style.chip)} strokeWidth={2.25} />
      <div className="flex-1 min-w-0">
        <div className={cn('label-eyebrow mb-0.5', style.chip)}>{style.kind}</div>
        <div className="text-foreground/95 leading-snug">{message.text}</div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(message.id);
        }}
        className="p-1 -mt-1 -mr-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
