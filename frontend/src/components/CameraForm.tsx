import { useEffect, useState } from 'react';
import type { CameraConfig, CameraTypeSchemas, FieldSchema } from '../types';

interface CameraFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: CameraConfig) => void;
  schemas: CameraTypeSchemas | null;
  editCamera?: CameraConfig | null;
}

const DEFAULT_CAMERA: CameraConfig = {
  id: '',
  enabled: true,
  name: '',
  mac: '',
  ip: '',
  model: 'UVC G3',
  fw_version: 'UVC.S2L.v4.23.8.67.0eba6e3.200526.1046',
  type: 'rtsp',
};

// Base fields that are handled in the common section
const COMMON_HANDLED = new Set([
  'ffmpeg-args', 'ffmpeg-base-args', 'rtsp-transport',
  'timestamp-modifier', 'loglevel', 'format',
]);

// Fields preserved across camera type changes
const COMMON_KEYS = new Set([
  'id', 'enabled', 'name', 'mac', 'ip', 'model', 'fw_version', 'type',
  'ffmpeg_args', 'ffmpeg_base_args', 'rtsp_transport',
  'timestamp_modifier', 'loglevel', 'format',
]);

export default function CameraForm({ isOpen, onClose, onSave, schemas, editCamera }: CameraFormProps) {
  const [form, setForm] = useState<CameraConfig>({ ...DEFAULT_CAMERA });

  useEffect(() => {
    if (editCamera) {
      setForm({ ...DEFAULT_CAMERA, ...editCamera });
    } else {
      setForm({ ...DEFAULT_CAMERA });
    }
  }, [editCamera, isOpen]);

  if (!isOpen || !schemas) return null;

  const cameraType = form.type || 'rtsp';
  const typeFields = schemas.types[cameraType] || [];

  const handleChange = (key: string, value: unknown) => {
    if (key === 'type' && schemas) {
      // Strip type-specific fields from old type, keep only common fields
      setForm((prev) => {
        const cleaned: CameraConfig = { ...DEFAULT_CAMERA };
        for (const k of Object.keys(prev)) {
          if (COMMON_KEYS.has(k)) {
            (cleaned as Record<string, unknown>)[k] = prev[k];
          }
        }
        cleaned.type = value as string;
        return cleaned;
      });
      return;
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  const renderField = (field: FieldSchema) => {
    const configKey = field.name.replace(/-/g, '_');
    const value = form[configKey];

    if (field.type === 'boolean') {
      return (
        <div key={field.name} className="flex items-center gap-2">
          <input
            type="checkbox"
            id={field.name}
            checked={!!value}
            onChange={(e) => handleChange(configKey, e.target.checked)}
            className="rounded bg-gray-800 border-gray-600"
          />
          <label htmlFor={field.name} className="text-sm text-gray-400">{field.help || field.name}</label>
        </div>
      );
    }

    if (field.choices) {
      return (
        <div key={field.name}>
          <label className="block text-sm text-gray-400 mb-1">
            {field.name}{field.required && <span className="text-red-400 ml-1">*</span>}
          </label>
          <select
            value={(value as string) || field.default as string || ''}
            onChange={(e) => handleChange(configKey, e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            {field.choices.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {field.help && <p className="text-xs text-gray-500 mt-1">{field.help}</p>}
        </div>
      );
    }

    return (
      <div key={field.name}>
        <label className="block text-sm text-gray-400 mb-1">
          {field.name}{field.required && <span className="text-red-400 ml-1">*</span>}
        </label>
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={value != null ? String(value) : ''}
          onChange={(e) => {
            const v = field.type === 'number' ? (e.target.value ? (Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value)) : null) : e.target.value;
            handleChange(configKey, v);
          }}
          placeholder={field.default != null ? String(field.default) : ''}
          className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        {field.help && <p className="text-xs text-gray-500 mt-1">{field.help}</p>}
      </div>
    );
  };

  // Split fields into base (common to all types) and type-specific
  const baseFields = typeFields.filter((f) => COMMON_HANDLED.has(f.name));
  const specificFields = typeFields.filter((f) => !COMMON_HANDLED.has(f.name));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h3 className="text-white font-medium text-lg">
            {editCamera ? 'Edit Camera' : 'Add Camera'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-5 space-y-4">
          {/* Common fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Camera Name<span className="text-red-400 ml-1">*</span></label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Camera Type</label>
                <select
                  value={form.type}
                  onChange={(e) => handleChange('type', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  {Object.keys(schemas.types).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">MAC Address</label>
                <input
                  type="text"
                  value={form.mac}
                  onChange={(e) => handleChange('mac', e.target.value)}
                  placeholder="AABBCCDDEEFF"
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">IP Address</label>
                <input
                  type="text"
                  value={form.ip}
                  onChange={(e) => handleChange('ip', e.target.value)}
                  placeholder="192.168.1.10"
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Model</label>
                <select
                  value={form.model}
                  onChange={(e) => handleChange('model', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  {schemas.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Firmware Version</label>
                <input
                  type="text"
                  value={form.fw_version}
                  onChange={(e) => handleChange('fw_version', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={form.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
                className="rounded bg-gray-800 border-gray-600"
              />
              <label htmlFor="enabled" className="text-sm text-gray-400">Enabled (auto-start on server launch)</label>
            </div>
          </div>

          {/* Type-specific fields */}
          {specificFields.length > 0 && (
            <div className="border-t border-gray-700 pt-4 space-y-4">
              <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider">
                {cameraType} Settings
              </h4>
              {specificFields.map(renderField)}
            </div>
          )}

          {/* Base ffmpeg fields (collapsible) */}
          {baseFields.length > 0 && (
            <details className="border-t border-gray-700 pt-4">
              <summary className="text-sm font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white">
                Advanced FFmpeg Settings
              </summary>
              <div className="mt-4 space-y-4">
                {baseFields.map(renderField)}
              </div>
            </details>
          )}

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
              {editCamera ? 'Update' : 'Add Camera'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
