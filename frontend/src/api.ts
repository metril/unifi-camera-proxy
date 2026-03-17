import type { AppConfig, CameraConfig, CameraStatus, CameraTypeSchemas, GlobalConfig, LogEntry } from './types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  getConfig: () => request<AppConfig>('/config'),

  updateGlobal: (config: GlobalConfig) =>
    request<GlobalConfig>('/config/global', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  listCameras: () => request<CameraStatus[]>('/cameras'),

  addCamera: (config: CameraConfig) =>
    request<CameraConfig>('/cameras', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  getCamera: (id: string) => request<CameraStatus>(`/cameras/${id}`),

  updateCamera: (id: string, config: CameraConfig) =>
    request<CameraConfig>(`/cameras/${id}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  deleteCamera: (id: string) =>
    request<{ status: string }>(`/cameras/${id}`, { method: 'DELETE' }),

  startCamera: (id: string) =>
    request<{ status: string }>(`/cameras/${id}/start`, { method: 'POST' }),

  stopCamera: (id: string) =>
    request<{ status: string }>(`/cameras/${id}/stop`, { method: 'POST' }),

  restartCamera: (id: string) =>
    request<{ status: string }>(`/cameras/${id}/restart`, { method: 'POST' }),

  startAll: () => request<{ status: string }>('/cameras/start-all'),
  stopAll: () => request<{ status: string }>('/cameras/stop-all'),

  getCameraLogs: (id: string) => request<{ logs: LogEntry[] }>(`/cameras/${id}/logs`),

  getCameraTypes: () => request<CameraTypeSchemas>('/camera-types'),

  fetchToken: (host: string, username: string | null, password: string | null, apiKey: string | null) =>
    request<{ token: string }>('/fetch-token', {
      method: 'POST',
      body: JSON.stringify({ host, username, password, api_key: apiKey }),
    }),

  testMqtt: (host: string, port: number, username: string | null, password: string | null, ssl: boolean, prefix: string) =>
    request<{ status: string; topics: string[] }>('/test-mqtt', {
      method: 'POST',
      body: JSON.stringify({ host, port, username, password, ssl, prefix }),
    }),

  testRtsp: (url: string, transport?: string, username?: string, password?: string) =>
    request<{ status: string; streams: Array<{ codec: string; type: string; resolution?: string; fps?: string }> }>('/test-rtsp', {
      method: 'POST',
      body: JSON.stringify({ url, transport: transport || 'tcp', username, password }),
    }),

  testFrigate: (url: string, username?: string | null, password?: string | null) =>
    request<{ status: string; cameras: string[]; version: string }>('/test-frigate', {
      method: 'POST',
      body: JSON.stringify({ url, username, password }),
    }),

  generateCert: (certPath?: string) =>
    request<{ status: string; path: string }>('/generate-cert', {
      method: 'POST',
      body: JSON.stringify(certPath ? { path: certPath } : {}),
    }),
};
