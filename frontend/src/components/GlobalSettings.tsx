import { useEffect, useState } from 'react';
import type { GlobalConfig } from '../types';

interface GlobalSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  config: GlobalConfig;
  onSave: (config: GlobalConfig) => void;
}

export default function GlobalSettings({ isOpen, onClose, config, onSave }: GlobalSettingsProps) {
  const [form, setForm] = useState<GlobalConfig>(config);

  useEffect(() => {
    setForm(config);
  }, [config, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof GlobalConfig, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h3 className="text-white font-medium text-lg">Global Settings</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">NVR Host</label>
            <input
              type="text"
              value={form.host}
              onChange={(e) => handleChange('host', e.target.value)}
              placeholder="192.168.1.1"
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Certificate Path</label>
            <input
              type="text"
              value={form.cert}
              onChange={(e) => handleChange('cert', e.target.value)}
              placeholder="/client.pem"
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Adoption Token</label>
            <input
              type="text"
              value={form.token}
              onChange={(e) => handleChange('token', e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
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
          <div className="flex justify-end gap-3 pt-2">
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
