import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { CameraConfig, CameraStatus, CameraTypeSchemas, GlobalConfig } from './types';
import Layout from './components/Layout';
import CameraGrid from './components/CameraGrid';
import CameraForm from './components/CameraForm';
import GlobalSettings from './components/GlobalSettings';

const DEFAULT_GLOBAL: GlobalConfig = {
  host: '',
  cert: 'client.pem',
  token: '',
  nvr_username: null,
  nvr_password: null,
  verbose: false,
  mqtt_host: '',
  mqtt_port: 1883,
  mqtt_username: null,
  mqtt_password: null,
  mqtt_prefix: 'frigate',
};

function App() {
  const [cameras, setCameras] = useState<CameraStatus[]>([]);
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(DEFAULT_GLOBAL);
  const [schemas, setSchemas] = useState<CameraTypeSchemas | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editCamera, setEditCamera] = useState<CameraConfig | null>(null);

  // Load initial data
  useEffect(() => {
    api.getConfig().then((data) => {
      setGlobalConfig(data.global);
    }).catch(() => {});
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
    await api.startCamera(id);
    fetchCameras();
  };

  const handleStop = async (id: string) => {
    await api.stopCamera(id);
    fetchCameras();
  };

  const handleRestart = async (id: string) => {
    await api.restartCamera(id);
    setTimeout(fetchCameras, 1500);
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
    if (editCamera && editCamera.id) {
      await api.updateCamera(editCamera.id, config);
    } else {
      await api.addCamera(config);
    }
    setShowForm(false);
    setEditCamera(null);
    fetchCameras();
  };

  const handleSaveGlobal = async (config: GlobalConfig) => {
    await api.updateGlobal(config);
    setGlobalConfig(config);
    setShowSettings(false);
  };

  const handleStartAll = async () => {
    await api.startAll();
    setTimeout(fetchCameras, 1000);
  };

  const handleStopAll = async () => {
    await api.stopAll();
    fetchCameras();
  };

  const handleAddCamera = () => {
    setEditCamera(null);
    setShowForm(true);
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
      />

      <GlobalSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        config={globalConfig}
        onSave={handleSaveGlobal}
      />
    </Layout>
  );
}

export default App;
