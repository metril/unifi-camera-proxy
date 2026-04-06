import { useEffect, useState } from 'react';
import { api } from '../api';
import type { CameraConfig, CameraTypeSchemas, FieldSchema, GlobalConfig } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface CameraFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: CameraConfig) => void;
  schemas: CameraTypeSchemas | null;
  editCamera?: CameraConfig | null;
  globalConfig: GlobalConfig;
}

function generateMac(): string {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  return `AABBCC${hex()}${hex()}${hex()}`;
}

const DEFAULT_CAMERA: CameraConfig = {
  id: '',
  enabled: true,
  name: '',
  mac: '',
  ip: '',
  model: 'UVC G4 Bullet',
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
  'rtsp_username', 'rtsp_password',
]);

const RTSP_FIELDS = new Set(['video1', 'video2', 'video3', 'source', 'rtsp']);

// Camera model resolution tiers for smart sorting
const MODEL_TIERS: Record<string, string> = {
  "UVC G6 Bullet": "4K", "UVC G6 Dome": "4K", "UVC G6 Turret": "4K",
  "UVC G6 PTZ": "4K", "UVC G6 Pro Bullet": "4K", "UVC G6 180": "4K",
  "UVC G5 Pro": "4K", "UVC G5 PTZ": "4K",
  "UVC G4 Pro": "4K", "UVC AI Pro": "4K", "UVC AI DSLR": "4K",
  "UVC G6 Instant": "2K",
  "UVC G5 Bullet": "2K", "UVC G5 Dome": "2K", "UVC G5 Dome Ultra": "2K",
  "UVC G5 Turret Ultra": "2K", "UVC G5 Flex": "2K",
  "UVC G4 Bullet": "2K", "UVC G4 Dome": "2K", "UVC G4 Instant": "2K",
  "UVC AI 360": "2K", "UVC AI Bullet": "2K",
  "UVC G3": "1080p", "UVC G3 Flex": "1080p", "UVC G3 Instant": "1080p",
  "UVC G3 Pro": "1080p", "UVC G3 Dome": "1080p", "UVC G3 Micro": "1080p",
  "UVC G3 Mini": "1080p", "UVC G3 Battery": "1080p",
};

function getResolutionTier(width: number): string {
  if (width >= 3840) return "4K";
  if (width >= 2560) return "2K";  // 5MP+ (2560x1920, 2688x1520)
  if (width >= 1920) return "2K";  // 4MP (2560x1440, 1920x1080 borderline)
  return "1080p";
}

// MQTT fields that are inherited from global settings — hidden per-camera unless overriding
const MQTT_FIELDS = new Set([
  'mqtt-host', 'mqtt-port', 'mqtt-username', 'mqtt-password', 'mqtt-prefix', 'mqtt-ssl',
]);

// Frigate API fields inherited from global settings
const FRIGATE_API_FIELDS = new Set([
  'frigate-http-url', 'frigate-username', 'frigate-password',
]);

const SELECT_CLASS = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export default function CameraForm({ isOpen, onClose, onSave, schemas, editCamera, globalConfig }: CameraFormProps) {
  const [form, setForm] = useState<CameraConfig>({ ...DEFAULT_CAMERA });
  const [rtspTest, setRtspTest] = useState<Record<string, { type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>>({});
  const [showCustomMqtt, setShowCustomMqtt] = useState(false);
  const [autoDetectStatus, setAutoDetectStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  const [frigateCameras, setFrigateCameras] = useState<string[]>([]);
  const [frigateCamerasLoading, setFrigateCamerasLoading] = useState(false);

  useEffect(() => {
    if (editCamera) {
      setForm({ ...DEFAULT_CAMERA, ...editCamera });
      // Show custom MQTT if the camera has per-camera MQTT overrides
      setShowCustomMqtt(!!editCamera.mqtt_host || !!editCamera.mqtt_port);
    } else {
      setForm({ ...DEFAULT_CAMERA });
      setShowCustomMqtt(false);
    }
  }, [editCamera, isOpen]);

  // Fetch Frigate camera list when type is frigate and URL is available
  useEffect(() => {
    if (!isOpen || form.type !== 'frigate') {
      setFrigateCameras([]);
      return;
    }
    const frigateUrl = (form.frigate_http_url as string) || globalConfig.frigate_http_url;
    if (!frigateUrl) {
      setFrigateCameras([]);
      return;
    }
    const frigateUser = (form.frigate_username as string) || globalConfig.frigate_username;
    const frigatePass = (form.frigate_password as string) || globalConfig.frigate_password;
    const verifySsl = globalConfig.frigate_verify_ssl ?? true;

    setFrigateCamerasLoading(true);
    api.testFrigate(frigateUrl, frigateUser, frigatePass, verifySsl)
      .then((result) => setFrigateCameras(result.cameras || []))
      .catch(() => setFrigateCameras([]))
      .finally(() => setFrigateCamerasLoading(false));
  }, [isOpen, form.type, form.frigate_http_url, globalConfig.frigate_http_url]);

  // Auto-trigger detect when a Frigate camera is selected from dropdown
  useEffect(() => {
    if (!isOpen || form.type !== 'frigate' || !form.frigate_camera) return;
    if (!frigateCameras.includes(form.frigate_camera as string)) return; // Only for dropdown selections
    handleAutoDetect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.frigate_camera]);

  if (!schemas) return null;

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
          <Switch
            id={field.name}
            checked={!!value}
            onCheckedChange={(checked) => handleChange(configKey, checked)}
          />
          <Label htmlFor={field.name}>{field.help || field.name}</Label>
        </div>
      );
    }

    if (field.choices) {
      return (
        <div key={field.name}>
          <Label className="block mb-1.5">
            {field.name}{field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          <select
            value={(value as string) || field.default as string || ''}
            onChange={(e) => handleChange(configKey, e.target.value)}
            className={SELECT_CLASS}
          >
            {field.choices.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {field.help && <p className="text-xs text-muted-foreground mt-1">{field.help}</p>}
        </div>
      );
    }

    const isRtspField = RTSP_FIELDS.has(field.name);
    const testState = rtspTest[field.name];

    const handleTestRtsp = async () => {
      const url = String(value || '');
      if (!url) return;
      setRtspTest((prev) => ({ ...prev, [field.name]: { type: 'loading' } }));
      try {
        const transport = (form.rtsp_transport as string) || 'tcp';
        // Use per-camera RTSP credentials, fall back to global
        const rtspUser = (form.rtsp_username as string) || globalConfig.rtsp_username || undefined;
        const rtspPass = (form.rtsp_password as string) || globalConfig.rtsp_password || undefined;
        const result = await api.testRtsp(url, transport, rtspUser, rtspPass);
        const info = result.streams.map((s) =>
          `${s.type}: ${s.codec}${s.resolution ? ` ${s.resolution}` : ''}${s.fps ? ` @${s.fps}` : ''}`
        ).join(', ');
        setRtspTest((prev) => ({ ...prev, [field.name]: { type: 'success', message: info || 'Stream reachable' } }));
      } catch (err) {
        setRtspTest((prev) => ({ ...prev, [field.name]: { type: 'error', message: err instanceof Error ? err.message : 'Test failed' } }));
      }
    };

    return (
      <div key={field.name}>
        <Label className="block mb-1.5">
          {field.name}{field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <div className={isRtspField ? 'flex gap-2' : ''}>
          <Input
            type={field.type === 'number' ? 'number' : 'text'}
            value={value != null ? String(value) : ''}
            onChange={(e) => {
              const v = field.type === 'number' ? (e.target.value ? (Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value)) : null) : e.target.value;
              handleChange(configKey, v);
            }}
            placeholder={field.default != null ? String(field.default) : ''}
            className={isRtspField ? 'flex-1' : ''}
          />
          {isRtspField && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestRtsp}
              disabled={!value || testState?.type === 'loading'}
              className="text-cyan-400 border-cyan-600/30 hover:bg-cyan-600/10 hover:text-cyan-300 whitespace-nowrap"
            >
              {testState?.type === 'loading' ? 'Testing…' : 'Test'}
            </Button>
          )}
        </div>
        {field.help && <p className="text-xs text-muted-foreground mt-1">{field.help}</p>}
        {testState?.type === 'success' && (
          <p className="text-xs text-green-400 mt-1">{testState.message}</p>
        )}
        {testState?.type === 'error' && (
          <p className="text-xs text-red-400 mt-1">{testState.message}</p>
        )}
      </div>
    );
  };

  // Split fields into base (common to all types), MQTT, Frigate API, and type-specific
  const baseFields = typeFields.filter((f) => COMMON_HANDLED.has(f.name));
  const mqttFields = typeFields.filter((f) => MQTT_FIELDS.has(f.name));
  const frigateApiFields = typeFields.filter((f) => FRIGATE_API_FIELDS.has(f.name));
  const specificFields = typeFields.filter((f) =>
    !COMMON_HANDLED.has(f.name) && !MQTT_FIELDS.has(f.name) && !FRIGATE_API_FIELDS.has(f.name) && f.name !== 'frigate-camera'
  );

  const handleAutoDetect = async () => {
    const frigateUrl = (form.frigate_http_url as string) || globalConfig.frigate_http_url;
    const frigateUser = (form.frigate_username as string) || globalConfig.frigate_username;
    const frigatePass = (form.frigate_password as string) || globalConfig.frigate_password;
    const cameraName = form.frigate_camera as string;

    if (!frigateUrl) {
      setAutoDetectStatus({ type: 'error', message: 'Set Frigate HTTP URL in global settings or per-camera' });
      return;
    }
    if (!cameraName) {
      setAutoDetectStatus({ type: 'error', message: 'Set the frigate-camera name first' });
      return;
    }

    setAutoDetectStatus({ type: 'loading' });
    try {
      const verifySsl = globalConfig.frigate_verify_ssl ?? true;
      const result = await api.detectFrigateCamera(frigateUrl, cameraName, frigateUser, frigatePass, verifySsl);
      // Auto-fill detected values
      if (result.detect.width) {
        handleChange('camera_width', result.detect.width);
        handleChange('frigate_detect_width', result.detect.width);
      }
      if (result.detect.height) {
        handleChange('camera_height', result.detect.height);
        handleChange('frigate_detect_height', result.detect.height);
      }
      if (result.detect.fps) {
        handleChange('video1_fps', result.detect.fps);
      }

      // Auto-fill video streams from Frigate's ffmpeg inputs
      for (const stream of result.streams) {
        if (stream.roles.includes('record') && stream.path) {
          handleChange('video1', stream.path);
        }
        if (stream.roles.includes('detect') && stream.path) {
          handleChange('video3', stream.path);
        }
      }
      // If no separate detect stream, use record stream for video3 too
      if (!result.streams.some(s => s.roles.includes('detect'))) {
        const recordStream = result.streams.find(s => s.roles.includes('record'));
        if (recordStream) handleChange('video3', recordStream.path);
      }

      // Extract camera IP — prefer go2rtc source (has real camera IP) over ffmpeg input (may be restream)
      const sourceUrl = result.camera_source_url || result.streams[0]?.path;
      if (sourceUrl && !form.ip) {
        try {
          const parsed = new URL(sourceUrl);
          if (parsed.hostname) handleChange('ip', parsed.hostname);
        } catch { /* non-URL path, skip */ }
      }

      // Auto-generate MAC if empty
      if (!form.mac) handleChange('mac', generateMac());

      const parts = [`Detect: ${result.detect.width}x${result.detect.height}@${result.detect.fps}fps`];
      const recordStream = result.streams.find(s => s.roles.includes('record'));
      if (recordStream) parts.push(`Record stream found`);
      parts.push(`record: ${result.record_enabled ? 'on' : 'off'}`);
      setAutoDetectStatus({ type: 'success', message: parts.join(' | ') });
    } catch (err) {
      setAutoDetectStatus({ type: 'error', message: err instanceof Error ? err.message : 'Auto-detect failed' });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>{editCamera ? 'Edit Camera' : 'Add Camera'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Common fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cam-name">Camera Name<span className="text-destructive ml-1">*</span></Label>
                <Input
                  id="cam-name"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cam-type">Camera Type</Label>
                <select
                  id="cam-type"
                  value={form.type}
                  onChange={(e) => handleChange('type', e.target.value)}
                  className={SELECT_CLASS}
                >
                  {Object.keys(schemas.types).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Frigate: camera name + auto-detect (shown early for Frigate cameras) */}
            {cameraType === 'frigate' && (
              <div className="space-y-3 border border-orange-600/20 bg-orange-600/5 rounded-lg p-3">
                <div className="space-y-1.5">
                  <Label>
                    Frigate Camera Name<span className="text-destructive ml-1">*</span>
                  </Label>
                  {frigateCameras.length > 0 ? (
                    <select
                      value={(form.frigate_camera as string) || ''}
                      onChange={(e) => {
                        handleChange('frigate_camera', e.target.value);
                        // Auto-populate name if empty
                        if (!form.name && e.target.value) {
                          handleChange('name', e.target.value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
                        }
                      }}
                      className={SELECT_CLASS}
                    >
                      <option value="">Select a camera...</option>
                      {frigateCameras.map((cam) => (
                        <option key={cam} value={cam}>{cam}</option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      value={(form.frigate_camera as string) || ''}
                      onChange={(e) => handleChange('frigate_camera', e.target.value)}
                      placeholder={frigateCamerasLoading ? 'Loading cameras...' : 'e.g., backyard, front_door'}
                    />
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-orange-400 border-orange-600/30 hover:bg-orange-600/10 hover:text-orange-300"
                  onClick={handleAutoDetect}
                  disabled={autoDetectStatus.type === 'loading' || !(form.frigate_camera as string)}
                >
                  {autoDetectStatus.type === 'loading' ? 'Detecting…' : 'Auto-detect from Frigate API'}
                </Button>
                {autoDetectStatus.type === 'success' && (
                  <p className="text-xs text-green-400">{autoDetectStatus.message}</p>
                )}
                {autoDetectStatus.type === 'error' && (
                  <p className="text-xs text-red-400">{autoDetectStatus.message}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cam-mac">MAC Address</Label>
                <div className="flex gap-2">
                  <Input
                    id="cam-mac"
                    value={form.mac}
                    onChange={(e) => handleChange('mac', e.target.value)}
                    placeholder="AABBCCDDEEFF"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleChange('mac', generateMac())}
                    title="Generate random MAC"
                  >
                    Random
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cam-ip">IP Address</Label>
                <Input
                  id="cam-ip"
                  value={form.ip}
                  onChange={(e) => handleChange('ip', e.target.value)}
                  placeholder="192.168.1.10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cam-model">Model</Label>
                <select
                  id="cam-model"
                  value={form.model}
                  onChange={(e) => handleChange('model', e.target.value)}
                  className={SELECT_CLASS}
                >
                  {(() => {
                    const camWidth = Number(form.camera_width) || 0;
                    const tier = camWidth ? getResolutionTier(camWidth) : '';
                    const sorted = [...schemas.models].sort((a, b) => {
                      if (!tier) return 0;
                      const aMatch = MODEL_TIERS[a] === tier ? 0 : 1;
                      const bMatch = MODEL_TIERS[b] === tier ? 0 : 1;
                      return aMatch - bMatch;
                    });
                    return sorted.map((m) => (
                      <option key={m} value={m}>
                        {m}{tier && MODEL_TIERS[m] === tier ? ' ✓' : ''}
                      </option>
                    ));
                  })()}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cam-fw">Firmware Version</Label>
                <Input
                  id="cam-fw"
                  value={form.fw_version}
                  onChange={(e) => handleChange('fw_version', e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="cam-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => handleChange('enabled', v)}
              />
              <Label htmlFor="cam-enabled">Enabled (auto-start on server launch)</Label>
            </div>
          </div>

          {/* Type-specific fields */}
          {specificFields.length > 0 && (
            <div className="border-t border-border pt-4 space-y-4">
              <h4 className="text-sm font-medium text-foreground uppercase tracking-wider">
                {cameraType} Settings
              </h4>
              {specificFields.map(renderField)}
            </div>
          )}

          {/* Per-camera Frigate API override (collapsible) */}
          {frigateApiFields.length > 0 && (
            <details className="border-t border-border pt-4">
              <summary className="text-sm font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground">
                Frigate API Override
                <span className="text-xs text-muted-foreground font-normal ml-2 normal-case">
                  (uses global settings if not overridden)
                </span>
              </summary>
              <div className="mt-4 space-y-4">
                {frigateApiFields.map(renderField)}
              </div>
            </details>
          )}

          {/* Per-camera MQTT override (collapsible, hidden by default) */}
          {mqttFields.length > 0 && (
            <details className="border-t border-border pt-4" open={showCustomMqtt}
              onToggle={(e) => setShowCustomMqtt((e.target as HTMLDetailsElement).open)}>
              <summary className="text-sm font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground">
                Custom MQTT Settings
                <span className="text-xs text-muted-foreground font-normal ml-2 normal-case">
                  (uses global settings if not overridden)
                </span>
              </summary>
              <div className="mt-4 space-y-4">
                {mqttFields.map(renderField)}
              </div>
            </details>
          )}

          {/* Per-camera RTSP auth override */}
          <details className="border-t border-border pt-4">
            <summary className="text-sm font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground">
              RTSP Authentication
              <span className="text-xs text-muted-foreground font-normal ml-2 normal-case">
                (uses global credentials if not overridden)
              </span>
            </summary>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rtsp-user">RTSP Username</Label>
                <Input
                  id="rtsp-user"
                  value={(form.rtsp_username as string) || ''}
                  onChange={(e) => handleChange('rtsp_username', e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rtsp-pass">RTSP Password</Label>
                <Input
                  id="rtsp-pass"
                  type="password"
                  value={(form.rtsp_password as string) || ''}
                  onChange={(e) => handleChange('rtsp_password', e.target.value || null)}
                />
              </div>
            </div>
          </details>

          {/* Per-camera auto-restart override */}
          <details className="border-t border-border pt-4">
            <summary className="text-sm font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground">
              Auto-Restart Override
              <span className="text-xs text-muted-foreground font-normal ml-2 normal-case">
                (uses global setting if not overridden)
              </span>
            </summary>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="cam-auto-restart"
                  checked={form.auto_restart_enabled !== undefined ? Boolean(form.auto_restart_enabled) : true}
                  onCheckedChange={(v) => handleChange('auto_restart_enabled', v)}
                />
                <Label htmlFor="cam-auto-restart">Enable auto-restart for this camera</Label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cam-auto-restart-max">Max Attempts</Label>
                  <Input
                    id="cam-auto-restart-max"
                    type="number"
                    min={0}
                    placeholder="Global default"
                    value={form.auto_restart_max_attempts !== undefined ? String(form.auto_restart_max_attempts) : ''}
                    onChange={(e) => handleChange('auto_restart_max_attempts', e.target.value === '' ? undefined : parseInt(e.target.value) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">0 = retry indefinitely</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cam-auto-restart-init">Initial Delay (s)</Label>
                  <Input
                    id="cam-auto-restart-init"
                    type="number"
                    min={1}
                    placeholder="Global default"
                    value={form.auto_restart_initial_delay !== undefined ? String(form.auto_restart_initial_delay) : ''}
                    onChange={(e) => handleChange('auto_restart_initial_delay', e.target.value === '' ? undefined : parseInt(e.target.value) || 5)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cam-auto-restart-max-delay">Max Delay (s)</Label>
                  <Input
                    id="cam-auto-restart-max-delay"
                    type="number"
                    min={1}
                    placeholder="Global default"
                    value={form.auto_restart_max_delay !== undefined ? String(form.auto_restart_max_delay) : ''}
                    onChange={(e) => handleChange('auto_restart_max_delay', e.target.value === '' ? undefined : parseInt(e.target.value) || 300)}
                  />
                </div>
              </div>
              {(form.auto_restart_enabled !== undefined || form.auto_restart_max_attempts !== undefined || form.auto_restart_initial_delay !== undefined || form.auto_restart_max_delay !== undefined) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    const next = { ...form };
                    delete next.auto_restart_enabled;
                    delete next.auto_restart_max_attempts;
                    delete next.auto_restart_initial_delay;
                    delete next.auto_restart_max_delay;
                    setForm(next);
                  }}
                >
                  Reset all to global defaults
                </Button>
              )}
            </div>
          </details>

          {/* Base ffmpeg fields (collapsible) */}
          {baseFields.length > 0 && (
            <details className="border-t border-border pt-4">
              <summary className="text-sm font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground">
                Advanced FFmpeg Settings
              </summary>
              <div className="mt-4 space-y-4">
                {baseFields.map(renderField)}
              </div>
            </details>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{editCamera ? 'Update' : 'Add Camera'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
