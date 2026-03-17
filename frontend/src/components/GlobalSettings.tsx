import { useEffect, useState } from 'react';
import { api } from '../api';
import type { GlobalConfig } from '../types';

interface GlobalSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  config: GlobalConfig;
  onSave: (config: GlobalConfig) => void;
}

export default function GlobalSettings({ isOpen, onClose, config, onSave }: GlobalSettingsProps) {
  const [form, setForm] = useState<GlobalConfig>(config);
  const [certStatus, setCertStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  const [tokenStatus, setTokenStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  const [mqttStatus, setMqttStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string; topics?: string[] }>({ type: 'idle' });

  useEffect(() => {
    setForm(config);
    setCertStatus({ type: 'idle' });
    setTokenStatus({ type: 'idle' });
    setMqttStatus({ type: 'idle' });
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof GlobalConfig, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  const handleGenerateCert = async () => {
    setCertStatus({ type: 'loading' });
    try {
      const result = await api.generateCert(form.cert);
      setCertStatus({ type: 'success', message: `Certificate generated: ${result.path}` });
    } catch (err) {
      setCertStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to generate certificate' });
    }
  };

  const handleTestMqtt = async () => {
    setMqttStatus({ type: 'loading' });
    try {
      const result = await api.testMqtt(
        form.mqtt_host, form.mqtt_port, form.mqtt_username, form.mqtt_password,
        form.mqtt_ssl || false, form.mqtt_prefix || 'frigate'
      );
      if (result.topics.length === 0) {
        setMqttStatus({ type: 'success', message: 'Connected but no topics received in 5 seconds', topics: [] });
      } else {
        setMqttStatus({ type: 'success', message: `Found ${result.topics.length} topics`, topics: result.topics });
      }
    } catch (err) {
      setMqttStatus({ type: 'error', message: err instanceof Error ? err.message : 'MQTT connection failed' });
    }
  };

  const handleFetchToken = async () => {
    setTokenStatus({ type: 'loading' });
    try {
      const result = await api.fetchToken(form.host, form.nvr_username, form.nvr_password, form.api_key);
      handleChange('token', result.token);
      setTokenStatus({ type: 'success', message: 'Token fetched successfully' });
    } catch (err) {
      setTokenStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to fetch token' });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h3 className="text-white font-medium text-lg">Global Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-5 space-y-4">
          {/* NVR Settings */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">UniFi Protect Host</label>
            <input
              type="text"
              value={form.host}
              onChange={(e) => handleChange('host', e.target.value)}
              placeholder="192.168.1.1 or protect.local"
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Certificate Path</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.cert}
                onChange={(e) => handleChange('cert', e.target.value)}
                placeholder="data/client.pem"
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleGenerateCert}
                disabled={certStatus.type === 'loading'}
                className="px-3 py-2 text-xs bg-green-600/20 text-green-400 border border-green-600/30 rounded hover:bg-green-600/30 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {certStatus.type === 'loading' ? 'Generating...' : 'Generate Cert'}
              </button>
            </div>
            {certStatus.type === 'success' && (
              <p className="text-xs text-green-400 mt-1">{certStatus.message}</p>
            )}
            {certStatus.type === 'error' && (
              <p className="text-xs text-red-400 mt-1">{certStatus.message}</p>
            )}
          </div>

          {/* NVR Credentials - before token so users set these first */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">NVR Username</label>
              <input
                type="text"
                value={form.nvr_username || ''}
                onChange={(e) => handleChange('nvr_username', e.target.value || null)}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">NVR Password</label>
              <input
                type="password"
                value={form.nvr_password || ''}
                onChange={(e) => handleChange('nvr_password', e.target.value || null)}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={form.api_key || ''}
              onChange={(e) => handleChange('api_key', e.target.value || null)}
              placeholder="Optional — used by cameras at runtime"
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Adoption Token</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.token}
                onChange={(e) => handleChange('token', e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleFetchToken}
                disabled={tokenStatus.type === 'loading' || !form.host || !form.nvr_username || !form.nvr_password}
                className="px-3 py-2 text-xs bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded hover:bg-blue-600/30 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {tokenStatus.type === 'loading' ? 'Fetching...' : 'Fetch Token'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Requires username/password above. Leave empty to auto-fetch on camera start. Tokens expire after 60 minutes.
            </p>
            {tokenStatus.type === 'success' && (
              <p className="text-xs text-green-400 mt-1">{tokenStatus.message}</p>
            )}
            {tokenStatus.type === 'error' && (
              <p className="text-xs text-red-400 mt-1">{tokenStatus.message}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="verbose"
              checked={form.verbose}
              onChange={(e) => handleChange('verbose', e.target.checked)}
              className="rounded bg-gray-800 border-gray-600"
            />
            <label htmlFor="verbose" className="text-sm text-gray-400">Verbose logging</label>
          </div>

          {/* MQTT Settings */}
          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-3">MQTT Settings (Frigate)</h4>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">MQTT Host</label>
                  <input
                    type="text"
                    value={form.mqtt_host || ''}
                    onChange={(e) => handleChange('mqtt_host', e.target.value)}
                    placeholder="192.168.1.2 or mqtt.local"
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Port</label>
                  <input
                    type="number"
                    value={form.mqtt_port || 1883}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      handleChange('mqtt_port', Number.isNaN(n) ? 1883 : Math.max(1, Math.min(65535, n)));
                    }}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">MQTT Username</label>
                  <input
                    type="text"
                    value={form.mqtt_username || ''}
                    onChange={(e) => handleChange('mqtt_username', e.target.value || null)}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">MQTT Password</label>
                  <input
                    type="password"
                    value={form.mqtt_password || ''}
                    onChange={(e) => handleChange('mqtt_password', e.target.value || null)}
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Topic Prefix</label>
                  <input
                    type="text"
                    value={form.mqtt_prefix || 'frigate'}
                    onChange={(e) => handleChange('mqtt_prefix', e.target.value)}
                    placeholder="frigate"
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="mqtt_ssl"
                      checked={form.mqtt_ssl || false}
                      onChange={(e) => handleChange('mqtt_ssl', e.target.checked)}
                      className="rounded bg-gray-800 border-gray-600"
                    />
                    <label htmlFor="mqtt_ssl" className="text-sm text-gray-400">SSL/TLS</label>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleTestMqtt}
                disabled={mqttStatus.type === 'loading' || !form.mqtt_host}
                className="w-full px-3 py-2 text-xs bg-purple-600/20 text-purple-400 border border-purple-600/30 rounded hover:bg-purple-600/30 transition-colors disabled:opacity-50"
              >
                {mqttStatus.type === 'loading' ? 'Discovering topics...' : 'Test MQTT & Discover Topics'}
              </button>
              {mqttStatus.type === 'success' && (
                <div>
                  <p className="text-xs text-green-400">{mqttStatus.message}</p>
                  {mqttStatus.topics && mqttStatus.topics.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-auto bg-black/30 rounded p-2">
                      {mqttStatus.topics.map((t) => (
                        <div key={t} className="text-xs text-gray-300 font-mono py-0.5">{t}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {mqttStatus.type === 'error' && (
                <p className="text-xs text-red-400">{mqttStatus.message}</p>
              )}
            </div>
          </div>

          {/* RTSP Authentication */}
          <div className="border-t border-gray-700 pt-4">
            <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-3">RTSP Authentication</h4>
            <p className="text-xs text-gray-500 mb-3">
              Auto-injected into RTSP URLs that don't already contain credentials. Leave empty for unauthenticated streams.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">RTSP Username</label>
                <input
                  type="text"
                  value={form.rtsp_username || ''}
                  onChange={(e) => handleChange('rtsp_username', e.target.value || null)}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">RTSP Password</label>
                <input
                  type="password"
                  value={form.rtsp_password || ''}
                  onChange={(e) => handleChange('rtsp_password', e.target.value || null)}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded border border-gray-600 hover:border-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
