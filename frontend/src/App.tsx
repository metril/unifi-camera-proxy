import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, cameraStatusWsUrl } from './api';
import type { CameraConfig, CameraStatus, CameraTypeSchemas, GlobalConfig } from './types';
import AppShell, { type View } from './components/AppShell';
import CameraGrid from './components/CameraGrid';
import CameraForm from './components/CameraForm';
import SettingsPage from './components/SettingsPage';
import LiveWall from './components/LiveWall';
import LiveViewsPage from './components/LiveViewsPage';
import LiveViewEditor from './components/LiveViewEditor';
import LiveViewPlayer from './components/LiveViewPlayer';
import Toast, { type ToastMessage } from './components/Toast';
import LoginPage from './components/LoginPage';
import { Button } from '@/components/ui/button';
import { useDocumentVisible } from '@/lib/useDocumentVisible';
import { useReconnectingWs } from '@/lib/useReconnectingWs';

const DEFAULT_GLOBAL: GlobalConfig = {
  host: '',
  cert: '/app/data/client.pem',
  token: '',
  nvr_username: null,
  nvr_password: null,
  api_key: null,
  verbose: false,
  mqtt_host: '',
  mqtt_port: 1883,
  mqtt_username: null,
  mqtt_password: null,
  mqtt_prefix: 'frigate',
  mqtt_ssl: false,
  rtsp_username: null,
  rtsp_password: null,
  frigate_http_url: '',
  frigate_username: null,
  frigate_password: null,
  frigate_verify_ssl: true,
  auto_restart_enabled: true,
  auto_restart_max_attempts: 0,
  auto_restart_initial_delay: 5,
  auto_restart_max_delay: 300,
};

// Public kiosk-display route: /live/<id>?token=<kiosk-token>. We mount the
// player directly without the AppShell so a TV/display gets a clean
// fullscreen render. Detected at the top of App so the rest of the
// component tree never instantiates for this path.
function detectLiveViewRoute(): { id: string; token: string | null } | null {
  const m = window.location.pathname.match(/^\/live\/([^/]+)\/?$/);
  if (!m) return null;
  const params = new URLSearchParams(window.location.search);
  return { id: m[1], token: params.get('token') };
}

function App() {
  const liveRoute = detectLiveViewRoute();
  if (liveRoute) {
    return <LiveViewPlayer viewId={liveRoute.id} kioskToken={liveRoute.token} />;
  }
  return <AppShellApp />;
}

function AppShellApp() {
  const [cameras, setCameras] = useState<CameraStatus[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(DEFAULT_GLOBAL);
  const [schemas, setSchemas] = useState<CameraTypeSchemas | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editCamera, setEditCamera] = useState<CameraConfig | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loadingCameras, setLoadingCameras] = useState(true);
  const [view, setView] = useState<View>('cameras');
  // Live View editor state: null = index, string = editing existing id,
  // '' = creating a new one.
  const [editingLiveViewId, setEditingLiveViewId] = useState<string | null>(null);

  const addToast = useCallback((text: string, type: ToastMessage['type'] = 'error') => {
    setToasts((prev) => [...prev, { id: Date.now(), text, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Extract OIDC session token from URL hash after login redirect
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#token=')) {
      localStorage.setItem('ui_token', hash.slice(7));
      window.history.replaceState(null, '', window.location.pathname);
    } else if (hash.startsWith('#auth_error=')) {
      addToast(`Authentication error: ${hash.slice(12)}`);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load initial data
  useEffect(() => {
    api.getConfig().then((data) => {
      setGlobalConfig(data.global);
    }).catch((err) => {
      if (err instanceof Error && err.message === 'Unauthorized') {
        setNeedsLogin(true);
      }
    });
    api.getCameraTypes().then(setSchemas).catch(() => {});
  }, []);

  // ---- Server-pushed camera status feed (replaces 3s poll) ----
  // We still do one initial fetch so the dashboard isn't blank if the WS
  // handshake races the first render; once the WS connects it sends a
  // fresh snapshot that overwrites the fetch result. Visibility gates
  // both: while the tab is hidden the WS is closed and we don't poll
  // either, so a backgrounded dashboard does ~zero network work.
  const visible = useDocumentVisible();
  const wsUrl = useMemo(() => (visible ? cameraStatusWsUrl() : null), [visible]);
  const camerasRef = useRef<CameraStatus[]>([]);
  useEffect(() => { camerasRef.current = cameras; }, [cameras]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    api
      .listCameras()
      .then((data) => { if (!cancelled) setCameras(data); })
      .catch((err) => {
        if (err instanceof Error && err.message === 'Unauthorized') {
          setNeedsLogin(true);
        }
      })
      .finally(() => { if (!cancelled) setLoadingCameras(false); });
    return () => { cancelled = true; };
  }, [visible]);

  const onStatusMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'snapshot' && Array.isArray(msg.data)) {
        setCameras(msg.data as CameraStatus[]);
        setLoadingCameras(false);
      }
    } catch {}
  }, []);

  useReconnectingWs({ url: wsUrl, onMessage: onStatusMessage });

  // Mark the document while the tab is hidden so CSS rules can hard-pause
  // animations. Browsers throttle but don't reliably stop them.
  useEffect(() => {
    if (visible) document.documentElement.removeAttribute('data-tab-hidden');
    else document.documentElement.setAttribute('data-tab-hidden', '');
  }, [visible]);

  const handleStart = useCallback(async (id: string) => {
    try {
      await api.startCamera(id);
    } catch (err) {
      addToast(`Failed to start camera: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [addToast]);

  const handleStop = useCallback(async (id: string) => {
    try {
      await api.stopCamera(id);
    } catch (err) {
      addToast(`Failed to stop camera: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [addToast]);

  const handleRestart = useCallback(async (id: string) => {
    try {
      await api.restartCamera(id);
    } catch (err) {
      addToast(`Failed to restart camera: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [addToast]);

  const handleSyncName = useCallback(async (id: string) => {
    try {
      const res = await api.syncCameraName(id);
      const cam = camerasRef.current.find((c) => c.id === id);
      const label = cam?.config.name || 'camera';
      if (res.status === 'updated') {
        addToast(`Synced name to Protect: ${res.detail ?? label}`, 'success');
      } else if (res.status === 'already_synced') {
        addToast(`"${label}" already in sync with Protect`, 'success');
      } else {
        addToast(`Sync name failed: ${res.detail ?? res.status}`);
      }
    } catch (err) {
      addToast(`Sync name failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [addToast]);

  const handleDelete = useCallback(async (id: string) => {
    await api.deleteCamera(id);
  }, []);

  const handleToggleEnabled = useCallback(async (id: string, enabled: boolean) => {
    const cam = camerasRef.current.find((c) => c.id === id);
    if (!cam) return;
    try {
      await api.updateCamera(id, { ...cam.config, enabled });
      addToast(
        enabled
          ? `"${cam.config.name || 'Camera'}" will auto-start on boot`
          : `"${cam.config.name || 'Camera'}" will be skipped on boot`,
        'success',
      );
    } catch (err) {
      addToast(
        `Failed to update camera: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }, [addToast]);

  const handleEdit = useCallback((id: string) => {
    const cam = camerasRef.current.find((c) => c.id === id);
    if (!cam) return;
    setEditCamera(cam.config);
    setShowForm(true);
  }, []);

  const handleSaveCamera = useCallback(async (config: CameraConfig) => {
    try {
      if (editCamera && editCamera.id) {
        await api.updateCamera(editCamera.id, config);
      } else {
        await api.addCamera(config);
      }
      setShowForm(false);
      setEditCamera(null);
    } catch (err) {
      addToast(`Failed to save camera: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [addToast, editCamera]);

  const handleSaveGlobal = useCallback(async (config: GlobalConfig) => {
    try {
      await api.updateGlobal(config);
      setGlobalConfig(config);
      addToast('Settings saved', 'success');
    } catch (err) {
      addToast(`Failed to save settings: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [addToast]);

  const handleStartAll = useCallback(async () => {
    try {
      await api.startAll();
      addToast('Starting all cameras…', 'success');
    } catch (err) {
      addToast(`Failed to start all: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [addToast]);

  const handleStopAll = useCallback(async () => {
    try {
      await api.stopAll();
    } catch (err) {
      addToast(`Failed to stop all: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [addToast]);

  const handleAddCamera = useCallback(() => {
    setEditCamera(null);
    setShowForm(true);
  }, []);

  const handleLogout = useCallback(() => {
    const token = localStorage.getItem('ui_token');
    localStorage.removeItem('ui_token');
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    window.location.href = `/api/auth/end-session${tokenParam}`;
  }, []);

  const runningCount = useMemo(
    () => cameras.filter((c) => c.status === 'running').length,
    [cameras],
  );
  const cameraCount = cameras.length;

  // Memoize the cameras-view actions JSX so AppShell's actions prop ref is
  // stable across polls — without this, AppShell re-renders every push.
  const camerasActions = useMemo(() => (
    <>
      {cameraCount > 0 && (
        <>
          <Button variant="outline" size="sm" className="h-9 text-xs text-emerald-300 border-emerald-600/30 hover:bg-emerald-600/10" onClick={handleStartAll}>
            Start all
          </Button>
          <Button variant="outline" size="sm" className="h-9 text-xs text-red-300 border-red-600/30 hover:bg-red-600/10" onClick={handleStopAll}>
            Stop all
          </Button>
        </>
      )}
      <Button size="sm" className="h-9" onClick={handleAddCamera}>
        <Plus className="w-4 h-4 mr-1.5" /> Add camera
      </Button>
    </>
  ), [cameraCount, handleStartAll, handleStopAll, handleAddCamera]);

  if (needsLogin) return <LoginPage />;

  const HEADERS: Record<View, { eyebrow: string; title: string; actions?: React.ReactNode }> = {
    cameras: { eyebrow: 'devices', title: 'Cameras', actions: camerasActions },
    'live-views':
      editingLiveViewId !== null
        ? { eyebrow: 'composing', title: editingLiveViewId ? 'Edit Live View' : 'New Live View' }
        : { eyebrow: 'displays', title: 'Live Views' },
    wall: { eyebrow: 'monitoring', title: 'Live Wall' },
    settings: { eyebrow: 'configuration', title: 'Settings' },
  };
  const h = HEADERS[view];

  return (
    <>
      <AppShell
        view={view}
        onNavigate={setView}
        runningCount={runningCount}
        cameraCount={cameras.length}
        hasOidc={globalConfig.has_oidc ?? false}
        onLogout={handleLogout}
        eyebrow={h.eyebrow}
        title={h.title}
        actions={h.actions}
      >
        {view === 'cameras' &&
          (loadingCameras ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border bg-card/40 overflow-hidden animate-pulse">
                  <div className="aspect-video bg-muted/40" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 w-2/3 bg-muted/40 rounded" />
                    <div className="h-3 w-1/3 bg-muted/30 rounded" />
                    <div className="h-8 bg-muted/20 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <CameraGrid
              cameras={cameras}
              onStart={handleStart}
              onStop={handleStop}
              onRestart={handleRestart}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleEnabled={handleToggleEnabled}
              onAdd={handleAddCamera}
            />
          ))}

        {view === 'live-views' &&
          (editingLiveViewId !== null ? (
            <div className="relative -mx-8 -my-7 h-[calc(100vh-4rem)] overflow-hidden">
              <LiveViewEditor
                cameras={cameras}
                editingId={editingLiveViewId || null}
                onClose={() => setEditingLiveViewId(null)}
                onSaved={() => setEditingLiveViewId(null)}
                onError={(msg) => addToast(msg)}
              />
            </div>
          ) : (
            <LiveViewsPage
              cameras={cameras}
              onEdit={(id) => setEditingLiveViewId(id)}
              onNew={() => setEditingLiveViewId('')}
              onToast={addToast}
            />
          ))}

        {view === 'wall' && <LiveWall cameras={cameras} />}

        {view === 'settings' && <SettingsPage config={globalConfig} onSave={handleSaveGlobal} />}
      </AppShell>

      <CameraForm
        isOpen={showForm}
        onClose={() => {
          setShowForm(false);
          setEditCamera(null);
        }}
        onSave={handleSaveCamera}
        schemas={schemas}
        editCamera={editCamera}
        globalConfig={globalConfig}
        cameraStatus={editCamera?.id ? cameras.find((c) => c.id === editCamera.id)?.status : undefined}
        onSyncName={handleSyncName}
      />

      <Toast messages={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default App;
