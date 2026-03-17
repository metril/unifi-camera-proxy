import { useEffect } from 'react';

export interface ToastMessage {
  id: number;
  text: string;
  type: 'error' | 'success' | 'info';
}

interface ToastProps {
  messages: ToastMessage[];
  onDismiss: (id: number) => void;
}

const COLORS = {
  error: 'bg-red-600/90 border-red-500',
  success: 'bg-green-600/90 border-green-500',
  info: 'bg-blue-600/90 border-blue-500',
};

export default function Toast({ messages, onDismiss }: ToastProps) {
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
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

  return (
    <div
      className={`${COLORS[message.type]} border rounded-lg px-4 py-3 text-white text-sm shadow-lg cursor-pointer animate-[slideIn_0.2s_ease-out]`}
      onClick={() => onDismiss(message.id)}
    >
      {message.text}
    </div>
  );
}
