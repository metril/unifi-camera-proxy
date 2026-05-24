import { memo, useEffect, useState, type ReactNode } from 'react';
import { Cctv, Grid2x2, MonitorPlay, Settings, LogOut, Radio, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDocumentVisible } from '@/lib/useDocumentVisible';

export type View = 'cameras' | 'live-views' | 'wall' | 'settings';

interface NavDef {
  id: View;
  label: string;
  icon: typeof Cctv;
  hint: string;
}

const NAV: NavDef[] = [
  { id: 'cameras', label: 'Cameras', icon: Cctv, hint: 'devices' },
  { id: 'live-views', label: 'Live Views', icon: Grid2x2, hint: 'displays' },
  { id: 'wall', label: 'Live Wall', icon: MonitorPlay, hint: 'monitoring' },
  { id: 'settings', label: 'Settings', icon: Settings, hint: 'configuration' },
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

/** Self-contained 1 Hz UTC clock — keeps its tick local so AppShell doesn't
 *  re-render every second. Also auto-pauses when the tab is hidden. */
const ClockTick = memo(function ClockTick() {
  const visible = useDocumentVisible();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    if (!visible) return;
    setClock(new Date());
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, [visible]);
  return (
    <span className="text-foreground/80 animate-tick">
      {clock.toISOString().substring(11, 19)}
    </span>
  );
});

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
  // Pull version from /health so the sidebar shows the running build.
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    fetch('/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.version && setVersion(d.version))
      .catch(() => {});
  }, []);

  const isLive = runningCount > 0;

  return (
    <div className="min-h-screen text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-[linear-gradient(180deg,hsl(222_47%_8%/0.92),hsl(224_71%_4%/0.92))] backdrop-blur-md">
        {/* Logo lockup */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-border relative">
          <div className="relative">
            <div className="w-8 h-8 rounded-md border border-primary/40 bg-primary/10 grid place-items-center">
              <Cctv className="w-4 h-4 text-primary" strokeWidth={2.25} />
            </div>
            <span className="absolute -right-0.5 -top-0.5 w-1.5 h-1.5 rounded-full bg-primary animate-signal shadow-[0_0_8px_hsl(var(--signal))]" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="font-semibold tracking-tight text-[0.95rem]">UniFi Proxy</div>
            <div className="label-eyebrow text-muted-foreground">camera control</div>
          </div>
          <span className="absolute bottom-[-1px] left-5 right-5 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map((item) => {
            const active = view === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all',
                  active
                    ? 'bg-primary/[0.08] text-foreground ring-1 ring-inset ring-primary/25'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-full bg-primary transition-opacity',
                    active ? 'opacity-100 shadow-[0_0_6px_hsl(var(--signal))]' : 'opacity-0',
                  )}
                />
                <Icon
                  className={cn('w-4 h-4 shrink-0 transition-colors', active && 'text-primary')}
                  strokeWidth={2}
                />
                <div className="flex-1 min-w-0 leading-tight">
                  <div className="font-medium">{item.label}</div>
                  <div className="label-hud text-muted-foreground/60 mt-0.5">{item.hint}</div>
                </div>
                <ChevronRight
                  className={cn(
                    'w-3 h-3 shrink-0 transition-all',
                    active ? 'text-primary opacity-80' : 'text-muted-foreground/40 opacity-0 group-hover:opacity-60',
                  )}
                />
              </button>
            );
          })}
        </nav>

        {/* Status block */}
        <div className="px-3 pb-3 pt-3 border-t border-border space-y-3">
          <div className="surface-panel rounded-md px-3 py-2.5">
            <div className="flex items-center justify-between mb-2">
              <div className="label-eyebrow text-muted-foreground">stream status</div>
              <Radio
                className={cn('w-3 h-3', isLive ? 'text-primary animate-signal' : 'text-muted-foreground/60')}
              />
            </div>
            <div className="flex items-end gap-1.5">
              <span className={cn('font-data text-2xl leading-none tabular-nums', isLive ? 'text-foreground' : 'text-muted-foreground')}>
                {runningCount}
              </span>
              <span className="font-data text-sm text-muted-foreground leading-none pb-0.5">/ {cameraCount}</span>
              <span className="label-hud text-muted-foreground/70 ml-auto pb-1">{isLive ? 'live' : 'idle'}</span>
            </div>
            <div className="mt-2 h-0.5 rounded-full bg-muted/30 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-700', isLive ? 'bg-primary' : 'bg-muted')}
                style={{ width: cameraCount > 0 ? `${(runningCount / cameraCount) * 100}%` : '0%' }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground font-data tabular-nums">
              <span className="opacity-70">UTC</span>
              <ClockTick />
            </div>
            {version && (
              <span className="chip chip-muted !py-0 !px-1.5 !text-[0.5625rem]">v{version}</span>
            )}
          </div>

          {hasOidc && onLogout && (
            <button
              onClick={onLogout}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-card/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-card/70 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 ml-64 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 flex items-center justify-between gap-4 px-8 border-b border-border bg-background/75 backdrop-blur-md">
          <div className="min-w-0 flex items-baseline gap-3">
            {eyebrow && <div className="label-eyebrow text-primary/80 whitespace-nowrap">{eyebrow}</div>}
            <span className="text-muted-foreground/40">/</span>
            <h1 className="text-lg font-semibold tracking-tight truncate">{title}</h1>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          {/* Hairline live-system gradient under the header. */}
          <span aria-hidden className="absolute bottom-[-1px] left-0 right-0 h-px bg-[linear-gradient(90deg,transparent_5%,hsl(var(--signal)/0.35)_50%,transparent_95%)]" />
        </header>
        <main className="flex-1 px-8 py-7 min-w-0">{children}</main>
      </div>
    </div>
  );
}
