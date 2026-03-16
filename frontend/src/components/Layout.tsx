import type { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
  onOpenSettings: () => void;
  onStartAll: () => void;
  onStopAll: () => void;
  onAddCamera: () => void;
  cameraCount: number;
  runningCount: number;
}

export default function Layout({
  children,
  onOpenSettings,
  onStartAll,
  onStopAll,
  onAddCamera,
  cameraCount,
  runningCount,
}: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <h1 className="text-lg font-semibold text-white">UniFi Cam Proxy</h1>
              {cameraCount > 0 && (
                <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
                  {runningCount}/{cameraCount} running
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {cameraCount > 0 && (
                <>
                  <button
                    onClick={onStartAll}
                    className="px-3 py-1.5 text-xs bg-green-600/20 text-green-400 border border-green-600/30 rounded hover:bg-green-600/30 transition-colors"
                  >
                    Start All
                  </button>
                  <button
                    onClick={onStopAll}
                    className="px-3 py-1.5 text-xs bg-red-600/20 text-red-400 border border-red-600/30 rounded hover:bg-red-600/30 transition-colors"
                  >
                    Stop All
                  </button>
                </>
              )}
              <button
                onClick={onAddCamera}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                + Add Camera
              </button>
              <button
                onClick={onOpenSettings}
                className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-800 transition-colors"
                title="Global Settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
