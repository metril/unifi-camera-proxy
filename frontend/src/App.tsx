import { useCallback, useEffect, useState } from 'react';
import { Plus, Grid2x2 } from 'lucide-react';
import { api } from './api';
import type { CameraConfig, CameraStatus, CameraTypeSchemas, GlobalConfig } from './types';
import AppShell, { type View } from './components/AppShell';
import CameraGrid from './components/CameraGrid';
import CameraForm from './components/CameraForm';
import SettingsPage from './components/SettingsPage';
import LiveWall from './components/LiveWall';
import GridFusionEditor from './components/gridfusion/GridFusionEditor';
import Toast, { type ToastMessage } from './components/Toast';
import LoginPage from './components/LoginPage';
import { Button } from '@/components/ui/button';

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

function App() {
  const [cameras, setCameras] = useState<CameraStatus[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(DEFAULT_GLOBAL);
  const [schemas, setSchemas] = useState<CameraTypeSchemas | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editCamera, setEditCamera] = useState<CameraConfig | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loadingCameras, setLoadingCameras] = useState(true);
  const [view, setView] = useState<View>('cameras');
  const [showGridFusion, setShowGridFusion] = useState(false);
  const [editGridFusion, setEditGridFusion] = useState<CameraConfig | null>(null);

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

  // Poll camera status
  const fetchCameras = useCallback(() => {
    api
      .listCameras()
      .then(setCameras)
      .catch(() => {})
      .finally(() => setLoadingCameras(false));
  }, []);

  useEffect(() => {
    fetchCameras();
    const interval = setInterval(fetchCameras, 3000);
    return () => clearInterval(interval);
  }, [fetchCameras]);

  const handleStart = async (id: string) => {
    try {
      await api.startCamera(id);
      fetchCameras();
    } catch (err) {
      addToast(`Failed to start camera: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleStop = async (id: string) => {
    try {
      await api.stopCamera(id);
      fetchCameras();
    } catch (err) {
      addToast(`Failed to stop camera: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleRestart = async (id: string) => {
    try {
      await api.restartCamera(id);
      setTimeout(fetchCameras, 1500);
    } catch (err) {
      addToast(`Failed to restart camera: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSyncName = async (id: string) => {
    try {
      const res = await api.syncCameraName(id);
      const cam = cameras.find((c) => c.id === id);
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
  };

  const handleDelete = async (id: string) => {
    await api.deleteCamera(id);
    fetchCameras();
  };

  const handleEdit = (id: string) => {
    const cam = cameras.find((c) => c.id === id);
    if (!cam) return;
    if (cam.config.type === 'mosaic') {
      setEditGridFusion(cam.config);
      setShowGridFusion(true);
    } else {
      setEditCamera(cam.config);
      setShowForm(true);
    }
  };

  const handleNewGridFusion = () => {
    setEditGridFusion(null);
    setShowGridFusion(true);
  };

  const handleSaveGridFusion = async (config: CameraConfig) => {
    try {
      if (config.id) {
        await api.updateCamera(config.id, config);
      } else {
        await api.addCamera(config);
      }
      setShowGridFusion(false);
      setEditGridFusion(null);
      fetchCameras();
    } catch (err) {
      addToast(`Failed to save composition: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSaveCamera = async (config: CameraConfig) => {
    try {
      if (editCamera && editCamera.id) {
        await api.updateCamera(editCamera.id, config);
      } else {
        await api.addCamera(config);
      }
      setShowForm(false);
      setEditCamera(null);
      fetchCameras();
    } catch (err) {
      addToast(`Failed to save camera: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleSaveGlobal = async (config: GlobalConfig) => {
    try {
      await api.updateGlobal(config);
      setGlobalConfig(config);
      addToast('Settings saved', 'success');
    } catch (err) {
      addToast(`Failed to save settings: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleStartAll = async () => {
    try {
      await api.startAll();
      setTimeout(fetchCameras, 1000);
      addToast('Starting all cameras…', 'success');
    } catch (err) {
      addToast(`Failed to start all: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleStopAll = async () => {
    try {
      await api.stopAll();
      fetchCameras();
    } catch (err) {
      addToast(`Failed to stop all: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAddCamera = () => {
    setEditCamera(null);
    setShowForm(true);
  };

  const handleLogout = () => {
    const token = localStorage.getItem('ui_token');
    localStorage.removeItem('ui_token');
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    window.location.href = `/api/auth/end-session${tokenParam}`;
  };

  const runningCount = cameras.filter((c) => c.status === 'running').length;

  if (needsLogin) return <LoginPage />;

  const regularCameras = cameras.filter((c) => c.config.type !== 'mosaic');
  const gridFusionCameras = cameras.filter((c) => c.config.type === 'mosaic');

  const HEADERS: Record<View, { eyebrow: string; title: string; actions?: React.ReactNode }> = {
    cameras: {
      eyebrow: 'devices',
      title: 'Cameras',
      actions: (
        <>
          {cameras.length > 0 && (
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
      ),
    },
    gridfusion: {
      eyebrow: 'matrix composer',
      title: 'GridFusion',
      actions: (
        <Button size="sm" className="h-9" onClick={handleNewGridFusion}>
          <Grid2x2 className="w-4 h-4 mr-1.5" /> New composition
        </Button>
      ),
    },
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
              cameras={regularCameras}
              onStart={handleStart}
              onStop={handleStop}
              onRestart={handleRestart}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onAdd={handleAddCamera}
            />
          ))}

        {view === 'gridfusion' && (
          <CameraGrid
            cameras={gridFusionCameras}
            onStart={handleStart}
            onStop={handleStop}
            onRestart={handleRestart}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onAdd={handleNewGridFusion}
            addLabel="New composition"
            emptyTitle="No compositions yet"
            emptyHint="Combine multiple cameras into one matrix stream"
            emptyIcon={<Grid2x2 className="w-14 h-14" />}
          />
        )}

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

      <GridFusionEditor
        isOpen={showGridFusion}
        onClose={() => {
          setShowGridFusion(false);
          setEditGridFusion(null);
        }}
        onSave={handleSaveGridFusion}
        cameras={cameras}
        editCamera={editGridFusion}
      />

      <Toast messages={toasts} onDismiss={dismissToast} />
    </>
  );
}

export default App;
