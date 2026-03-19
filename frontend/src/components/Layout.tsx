import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface LayoutProps {
  children: ReactNode;
  onOpenSettings: () => void;
  onStartAll: () => void;
  onStopAll: () => void;
  onAddCamera: () => void;
  cameraCount: number;
  runningCount: number;
  hasOidc?: boolean;
  onLogout?: () => void;
}

export default function Layout({
  children,
  onOpenSettings,
  onStartAll,
  onStopAll,
  onAddCamera,
  cameraCount,
  runningCount,
  hasOidc,
  onLogout,
}: LayoutProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="font-semibold text-foreground">UniFi Cam Proxy</span>
              </div>
              {cameraCount > 0 && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {runningCount}/{cameraCount} running
                </Badge>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {cameraCount > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-green-400 border-green-600/30 hover:bg-green-600/10 hover:text-green-300 hover:border-green-600/50"
                    onClick={onStartAll}
                  >
                    Start All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs text-red-400 border-red-600/30 hover:bg-red-600/10 hover:text-red-300 hover:border-red-600/50"
                    onClick={onStopAll}
                  >
                    Stop All
                  </Button>
                  <Separator orientation="vertical" className="h-5 mx-1" />
                </>
              )}
              <Button size="sm" className="h-8 text-xs" onClick={onAddCamera}>
                + Add Camera
              </Button>
              {hasOidc && onLogout && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={onLogout}
                  title="Logout"
                >
                  Logout
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={onOpenSettings}
                title="Global Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
