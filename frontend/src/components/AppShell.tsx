import type { ReactNode } from 'react';
import { Cctv, Grid2x2, MonitorPlay, Settings, LogOut, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

export type View = 'cameras' | 'gridfusion' | 'wall' | 'settings';

interface NavDef {
  id: View;
  label: string;
  icon: typeof Cctv;
  hint: string;
}

const NAV: NavDef[] = [
  { id: 'cameras', label: 'Cameras', icon: Cctv, hint: 'Manage proxied cameras' },
  { id: 'gridfusion', label: 'GridFusion', icon: Grid2x2, hint: 'Compose multi-camera matrices' },
  { id: 'wall', label: 'Live Wall', icon: MonitorPlay, hint: 'Live video of every camera' },
  { id: 'settings', label: 'Settings', icon: Settings, hint: 'Protect, MQTT, Frigate, auth' },
];

interface AppShellProps {
  view: View;
  onNavigate: (v: View) => void;
  runningCount: number;
  cameraCount: number;
  hasOidc?: boolean;
  onLogout?: () => void;
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function AppShell({
  view,
  onNavigate,
  runningCount,
  cameraCount,
  hasOidc,
  onLogout,
  title,
  eyebrow,
  actions,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen text-foreground flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-card/60 backdrop-blur-sm flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-border">
          <div className="relative">
            <Cctv className="w-6 h-6 text-primary" strokeWidth={2} />
            <span className="absolute -right-0.5 -top-0.5 w-2 h-2 rounded-full bg-primary animate-signal" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-tight">UniFi Proxy</div>
            <div className="label-eyebrow text-muted-foreground">camera control</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active = view === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={item.hint}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                  active
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                <span
                  className={cn(
                    'absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary transition-opacity',
                    active ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <Icon className="w-4.5 h-4.5 shrink-0" strokeWidth={2} />
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-border space-y-3">
          <div className="flex items-center gap-2 text-xs">
            <Radio
              className={cn('w-3.5 h-3.5', runningCount > 0 ? 'text-emerald-400 animate-signal' : 'text-muted-foreground')}
            />
            <span className="font-data text-muted-foreground">
              <span className={runningCount > 0 ? 'text-emerald-400' : 'text-foreground'}>{runningCount}</span>
              /{cameraCount} live
            </span>
          </div>
          {hasOidc && onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 ml-60 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 flex items-center justify-between gap-4 px-8 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="min-w-0">
            {eyebrow && <div className="label-eyebrow text-primary/80">{eyebrow}</div>}
            <h1 className="text-lg font-semibold tracking-tight truncate">{title}</h1>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
        <main className="flex-1 px-8 py-7 min-w-0">{children}</main>
      </div>
    </div>
  );
}
