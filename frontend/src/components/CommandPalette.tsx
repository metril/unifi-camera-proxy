import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  Play,
  Square,
  RotateCw,
  ScrollText,
  Cctv,
  MonitorPlay,
  Grid2x2,
  Settings,
  Search,
  CornerDownLeft,
  Power,
  PowerOff,
} from 'lucide-react';
import type { CameraStatus } from '../types';
import type { View } from './AppShell';
import { cn } from '@/lib/utils';

type Verb =
  | 'jump'
  | 'start'
  | 'stop'
  | 'restart'
  | 'logs'
  | 'enable'
  | 'disable'
  | 'view'
  | 'system';

interface Command {
  id: string;
  verb: Verb;
  label: string;
  detail?: string;
  icon: typeof Play;
  /** Lowercase haystack the fuzzy match runs against. */
  haystack: string;
  run: () => void;
}

interface CommandPaletteProps {
  cameras: CameraStatus[];
  onJumpToCamera: (id: string) => void;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onOpenLogs: (id: string) => void;
  onSwitchView: (v: View) => void;
  onStartAll: () => void;
  onStopAll: () => void;
}

const VERB_LABEL: Record<Verb, string> = {
  jump: 'Jump to',
  start: 'Start',
  stop: 'Stop',
  restart: 'Restart',
  logs: 'Open logs for',
  enable: 'Enable auto-start',
  disable: 'Disable auto-start',
  view: 'Switch to',
  system: 'System',
};

export default function CommandPalette({
  cameras,
  onJumpToCamera,
  onStart,
  onStop,
  onRestart,
  onToggleEnabled,
  onOpenLogs,
  onSwitchView,
  onStartAll,
  onStopAll,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global keybind: ⌘K / ctrl+K. Esc closes (handled by Radix).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Reset and focus on open.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    // Defer focus past the dialog mount.
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);
  const fire = useCallback(
    (cmd: Command) => {
      close();
      // Defer so the modal can unmount before whatever the action does
      // (e.g. open another dialog) takes focus.
      setTimeout(() => cmd.run(), 0);
    },
    [close],
  );

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];
    // System / view-switching commands first — they don't depend on cameras.
    list.push(
      {
        id: 'view-cameras',
        verb: 'view',
        label: 'Switch to Cameras',
        icon: Cctv,
        haystack: 'cameras view list',
        run: () => onSwitchView('cameras'),
      },
      {
        id: 'view-live-views',
        verb: 'view',
        label: 'Switch to Live Views',
        icon: Grid2x2,
        haystack: 'live views compositions layouts',
        run: () => onSwitchView('live-views'),
      },
      {
        id: 'view-wall',
        verb: 'view',
        label: 'Switch to Live Wall',
        icon: MonitorPlay,
        haystack: 'live wall monitoring',
        run: () => onSwitchView('wall'),
      },
      {
        id: 'view-settings',
        verb: 'view',
        label: 'Switch to Settings',
        icon: Settings,
        haystack: 'settings configuration',
        run: () => onSwitchView('settings'),
      },
      {
        id: 'sys-start-all',
        verb: 'system',
        label: 'Start all cameras',
        icon: Play,
        haystack: 'start all cameras',
        run: onStartAll,
      },
      {
        id: 'sys-stop-all',
        verb: 'system',
        label: 'Stop all cameras',
        icon: Square,
        haystack: 'stop all cameras',
        run: onStopAll,
      },
    );
    for (const c of cameras) {
      const name = c.config.name || 'Unnamed';
      const baseHay = `${name} ${c.config.mac ?? ''} ${c.config.ip ?? ''} ${c.config.model ?? ''}`.toLowerCase();
      list.push({
        id: `jump-${c.id}`,
        verb: 'jump',
        label: `Jump to ${name}`,
        detail: c.config.mac || c.config.model,
        icon: Cctv,
        haystack: baseHay + ' jump',
        run: () => onJumpToCamera(c.id),
      });
      list.push({
        id: `logs-${c.id}`,
        verb: 'logs',
        label: `Open logs for ${name}`,
        icon: ScrollText,
        haystack: baseHay + ' logs',
        run: () => onOpenLogs(c.id),
      });
      if (c.status === 'running') {
        list.push({
          id: `stop-${c.id}`,
          verb: 'stop',
          label: `Stop ${name}`,
          icon: Square,
          haystack: baseHay + ' stop',
          run: () => onStop(c.id),
        });
        list.push({
          id: `restart-${c.id}`,
          verb: 'restart',
          label: `Restart ${name}`,
          icon: RotateCw,
          haystack: baseHay + ' restart',
          run: () => onRestart(c.id),
        });
      } else {
        list.push({
          id: `start-${c.id}`,
          verb: 'start',
          label: `Start ${name}`,
          icon: Play,
          haystack: baseHay + ' start',
          run: () => onStart(c.id),
        });
      }
      if (c.config.enabled === false) {
        list.push({
          id: `enable-${c.id}`,
          verb: 'enable',
          label: `Enable auto-start for ${name}`,
          icon: Power,
          haystack: baseHay + ' enable auto-start',
          run: () => onToggleEnabled(c.id, true),
        });
      } else {
        list.push({
          id: `disable-${c.id}`,
          verb: 'disable',
          label: `Disable auto-start for ${name}`,
          icon: PowerOff,
          haystack: baseHay + ' disable auto-start',
          run: () => onToggleEnabled(c.id, false),
        });
      }
    }
    return list;
  }, [
    cameras,
    onJumpToCamera,
    onStart,
    onStop,
    onRestart,
    onOpenLogs,
    onToggleEnabled,
    onSwitchView,
    onStartAll,
    onStopAll,
  ]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Without a query, just show view-switching + system actions.
      return commands.filter((c) => c.verb === 'view' || c.verb === 'system');
    }
    // Token-based substring match; every whitespace-separated token must
    // appear somewhere in the haystack. Keeps the matching fast and
    // intent-aligned ("garage stop" → only stop-Garage, not all stops).
    const tokens = q.split(/\s+/);
    return commands.filter((c) => tokens.every((t) => c.haystack.includes(t)));
  }, [commands, query]);

  // Clamp active index to results length.
  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results.length, active]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = results[active];
      if (cmd) fire(cmd);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-[50%] top-[15%] z-[60] w-[min(640px,94vw)] -translate-x-1/2 rounded-lg border border-border surface-panel shadow-2xl overflow-hidden outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Jump to a camera, start/stop, switch view…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-card/40 text-[0.625rem] text-muted-foreground font-data">
              ESC
            </kbd>
          </div>
          <div className="max-h-[60vh] overflow-auto py-1">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No matches for <span className="font-data">{query}</span>
              </div>
            ) : (
              results.map((cmd, i) => {
                const Icon = cmd.icon;
                const isActive = i === active;
                return (
                  <button
                    key={cmd.id}
                    type="button"
                    onMouseMove={() => setActive(i)}
                    onClick={() => fire(cmd)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
                      isActive ? 'bg-primary/[0.08]' : 'hover:bg-accent/30',
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-3.5 h-3.5 shrink-0',
                        isActive ? 'text-primary' : 'text-muted-foreground',
                      )}
                    />
                    <span className="label-hud text-muted-foreground/70 shrink-0 w-20">
                      {VERB_LABEL[cmd.verb]}
                    </span>
                    <span className="text-sm truncate flex-1">{cmd.label}</span>
                    {cmd.detail && (
                      <span className="label-hud text-muted-foreground/60 shrink-0 font-data tabular-nums hidden sm:inline">
                        {cmd.detail}
                      </span>
                    )}
                    {isActive && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-primary/80 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-border px-3 py-1.5 flex items-center justify-between text-[0.625rem] text-muted-foreground">
            <span className="flex items-center gap-3">
              <span><kbd className="font-data">↑↓</kbd> navigate</span>
              <span><kbd className="font-data">⏎</kbd> run</span>
            </span>
            <span className="font-data">
              {results.length} result{results.length === 1 ? '' : 's'}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
