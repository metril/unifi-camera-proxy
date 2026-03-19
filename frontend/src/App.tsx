import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { CameraConfig, CameraStatus, CameraTypeSchemas, GlobalConfig } from './types';
import Layout from './components/Layout';
import CameraGrid from './components/CameraGrid';
import CameraForm from './components/CameraForm';
import GlobalSettings from './components/GlobalSettings';
import Toast, { type ToastMessage } from './components/Toast';

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
};

function App() {
  const [cameras, setCameras] = useState<CameraStatus[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(DEFAULT_GLOBAL);
  const [schemas, setSchemas] = useState<CameraTypeSchemas | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editCamera, setEditCamera] = useState<CameraConfig | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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
        window.location.href = '/api/auth/login';
      }
    });
    api.getCameraTypes().then(setSchemas).catch(() => {});
  }, []);

  // Poll camera status
  const fetchCameras = useCallback(() => {
    api.listCameras().then(setCameras).catch(() => {});
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

  const handleDelete = async (id: string) => {
    await api.deleteCamera(id);
    fetchCameras();
  };

  const handleEdit = (id: string) => {
    const cam = cameras.find((c) => c.id === id);
    if (cam) {
      setEditCamera(cam.config);
      setShowForm(true);
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
      setShowSettings(false);
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

  const handleLogout = async () => {
    await api.logout();
    window.location.href = '/api/auth/login';
  };

  const runningCount = cameras.filter((c) => c.status === 'running').length;

  return (
    <Layout
      onOpenSettings={() => setShowSettings(true)}
      onStartAll={handleStartAll}
      onStopAll={handleStopAll}
      onAddCamera={handleAddCamera}
      cameraCount={cameras.length}
      runningCount={runningCount}
      hasOidc={globalConfig.has_oidc ?? false}
      onLogout={handleLogout}
    >
      <CameraGrid
        cameras={cameras}
        onStart={handleStart}
        onStop={handleStop}
        onRestart={handleRestart}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onAdd={handleAddCamera}
      />

      <CameraForm
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditCamera(null); }}
        onSave={handleSaveCamera}
        schemas={schemas}
        editCamera={editCamera}
        globalConfig={globalConfig}
      />

      <GlobalSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        config={globalConfig}
        onSave={handleSaveGlobal}
      />

      <Toast messages={toasts} onDismiss={dismissToast} />
    </Layout>
  );
}

export default App;
