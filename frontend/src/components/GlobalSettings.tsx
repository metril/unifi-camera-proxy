import { useEffect, useState } from 'react';
import { api } from '../api';
import type { GlobalConfig } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

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
  const [frigateStatus, setFrigateStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message?: string; cameras?: string[] }>({ type: 'idle' });

  useEffect(() => {
    setForm(config);
    setCertStatus({ type: 'idle' });
    setTokenStatus({ type: 'idle' });
    setMqttStatus({ type: 'idle' });
    setFrigateStatus({ type: 'idle' });
  }, [config, isOpen]);

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

  const handleTestFrigate = async () => {
    setFrigateStatus({ type: 'loading' });
    try {
      const result = await api.testFrigate(form.frigate_http_url, form.frigate_username, form.frigate_password, form.frigate_verify_ssl);
      setFrigateStatus({
        type: 'success',
        message: `Connected (v${result.version}). Found ${result.cameras.length} camera(s)`,
        cameras: result.cameras,
      });
    } catch (err) {
      setFrigateStatus({ type: 'error', message: err instanceof Error ? err.message : 'Connection failed' });
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Global Settings</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* OIDC Authentication */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground uppercase tracking-wider">OIDC Authentication</h4>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Configure Authentik (or any OIDC provider). Leave all fields empty to disable authentication.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="oidc_issuer">Issuer URL</Label>
              <Input
                id="oidc_issuer"
                value={form.oidc_issuer || ''}
                onChange={(e) => handleChange('oidc_issuer', e.target.value)}
                placeholder="https://auth.example.com/application/o/unifi-cam-proxy/"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="oidc_client_id">Client ID</Label>
                <Input
                  id="oidc_client_id"
                  value={form.oidc_client_id || ''}
                  onChange={(e) => handleChange('oidc_client_id', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="oidc_client_secret">Client Secret</Label>
                <Input
                  id="oidc_client_secret"
                  type="password"
                  value={form.oidc_client_secret || ''}
                  onChange={(e) => handleChange('oidc_client_secret', e.target.value || null)}
                  placeholder={config.has_oidc ? 'Leave blank to keep existing' : ''}
                  autoComplete="new-password"
                />
              </div>
            </div>
            </div>
          </div>

          <Separator />

          {/* NVR Settings */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground uppercase tracking-wider">NVR Connection</h4>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="host">UniFi Protect Host</Label>
            <Input
              id="host"
              value={form.host}
              onChange={(e) => handleChange('host', e.target.value)}
              placeholder="192.168.1.1 or protect.local"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cert">Certificate Path</Label>
            <div className="flex gap-2">
              <Input
                id="cert"
                value={form.cert}
                onChange={(e) => handleChange('cert', e.target.value)}
                placeholder="data/client.pem"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateCert}
                disabled={certStatus.type === 'loading'}
                className="text-green-400 border-green-600/30 hover:bg-green-600/10 hover:text-green-300 whitespace-nowrap"
              >
                {certStatus.type === 'loading' ? 'Generating…' : 'Generate Cert'}
              </Button>
            </div>
            {certStatus.type === 'success' && <p className="text-xs text-green-400">{certStatus.message}</p>}
            {certStatus.type === 'error' && <p className="text-xs text-red-400">{certStatus.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nvr_username">NVR Username</Label>
              <Input
                id="nvr_username"
                value={form.nvr_username || ''}
                onChange={(e) => handleChange('nvr_username', e.target.value || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nvr_password">NVR Password</Label>
              <Input
                id="nvr_password"
                type="password"
                value={form.nvr_password || ''}
                onChange={(e) => handleChange('nvr_password', e.target.value || null)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="api_key">API Key</Label>
            <Input
              id="api_key"
              type="password"
              value={form.api_key || ''}
              onChange={(e) => handleChange('api_key', e.target.value || null)}
              placeholder="Optional — used by cameras at runtime"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="token">Adoption Token</Label>
            <div className="flex gap-2">
              <Input
                id="token"
                value={form.token}
                onChange={(e) => handleChange('token', e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleFetchToken}
                disabled={tokenStatus.type === 'loading' || !form.host || !form.nvr_username || !form.nvr_password}
                className="text-blue-400 border-blue-600/30 hover:bg-blue-600/10 hover:text-blue-300 whitespace-nowrap"
              >
                {tokenStatus.type === 'loading' ? 'Fetching…' : 'Fetch Token'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Requires username/password above. Leave empty to auto-fetch on camera start. Tokens expire after 60 minutes.
            </p>
            {tokenStatus.type === 'success' && <p className="text-xs text-green-400">{tokenStatus.message}</p>}
            {tokenStatus.type === 'error' && <p className="text-xs text-red-400">{tokenStatus.message}</p>}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="verbose"
              checked={form.verbose}
              onCheckedChange={(v) => handleChange('verbose', v)}
            />
            <Label htmlFor="verbose">Verbose logging</Label>
          </div>
            </div>
          </div>

          <Separator />

          {/* MQTT Settings */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground uppercase tracking-wider">MQTT Settings (Frigate)</h4>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="mqtt_host">MQTT Host</Label>
                <Input
                  id="mqtt_host"
                  value={form.mqtt_host || ''}
                  onChange={(e) => handleChange('mqtt_host', e.target.value)}
                  placeholder="192.168.1.2 or mqtt.local"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mqtt_port">Port</Label>
                <Input
                  id="mqtt_port"
                  type="number"
                  value={form.mqtt_port || 1883}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    handleChange('mqtt_port', Number.isNaN(n) ? 1883 : Math.max(1, Math.min(65535, n)));
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mqtt_username">MQTT Username</Label>
                <Input
                  id="mqtt_username"
                  value={form.mqtt_username || ''}
                  onChange={(e) => handleChange('mqtt_username', e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mqtt_password">MQTT Password</Label>
                <Input
                  id="mqtt_password"
                  type="password"
                  value={form.mqtt_password || ''}
                  onChange={(e) => handleChange('mqtt_password', e.target.value || null)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mqtt_prefix">Topic Prefix</Label>
                <Input
                  id="mqtt_prefix"
                  value={form.mqtt_prefix || 'frigate'}
                  onChange={(e) => handleChange('mqtt_prefix', e.target.value)}
                  placeholder="frigate"
                />
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center gap-2">
                  <Switch
                    id="mqtt_ssl"
                    checked={form.mqtt_ssl || false}
                    onCheckedChange={(v) => handleChange('mqtt_ssl', v)}
                  />
                  <Label htmlFor="mqtt_ssl">SSL/TLS</Label>
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-purple-400 border-purple-600/30 hover:bg-purple-600/10 hover:text-purple-300"
              onClick={handleTestMqtt}
              disabled={mqttStatus.type === 'loading' || !form.mqtt_host}
            >
              {mqttStatus.type === 'loading' ? 'Discovering topics…' : 'Test MQTT & Discover Topics'}
            </Button>
            {mqttStatus.type === 'success' && (
              <div>
                <p className="text-xs text-green-400">{mqttStatus.message}</p>
                {mqttStatus.topics && mqttStatus.topics.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-auto bg-black/30 rounded p-2">
                    {mqttStatus.topics.map((t) => (
                      <div key={t} className="text-xs text-muted-foreground font-mono py-0.5">{t}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {mqttStatus.type === 'error' && <p className="text-xs text-red-400">{mqttStatus.message}</p>}
            </div>
          </div>

          <Separator />

          {/* Frigate Settings */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground uppercase tracking-wider">Frigate Settings</h4>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="frigate_http_url">Frigate HTTP URL</Label>
              <Input
                id="frigate_http_url"
                value={form.frigate_http_url || ''}
                onChange={(e) => handleChange('frigate_http_url', e.target.value)}
                placeholder="http://frigate:5000"
              />
              <p className="text-xs text-muted-foreground">
                Used for snapshots and auto-detecting stream resolution/FPS/bitrate
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="frigate_username">Frigate Username</Label>
                <Input
                  id="frigate_username"
                  value={form.frigate_username || ''}
                  onChange={(e) => handleChange('frigate_username', e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="frigate_password">Frigate Password</Label>
                <Input
                  id="frigate_password"
                  type="password"
                  value={form.frigate_password || ''}
                  onChange={(e) => handleChange('frigate_password', e.target.value || null)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="frigate_verify_ssl"
                checked={form.frigate_verify_ssl}
                onCheckedChange={(v) => handleChange('frigate_verify_ssl', v)}
              />
              <Label htmlFor="frigate_verify_ssl">
                Verify SSL certificates
                <span className="text-xs text-muted-foreground ml-1">(uncheck for self-signed certs)</span>
              </Label>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-orange-400 border-orange-600/30 hover:bg-orange-600/10 hover:text-orange-300"
              onClick={handleTestFrigate}
              disabled={frigateStatus.type === 'loading' || !form.frigate_http_url}
            >
              {frigateStatus.type === 'loading' ? 'Testing…' : 'Test Frigate Connection'}
            </Button>
            {frigateStatus.type === 'success' && (
              <div>
                <p className="text-xs text-green-400">{frigateStatus.message}</p>
                {frigateStatus.cameras && frigateStatus.cameras.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {frigateStatus.cameras.map((c) => (
                      <span key={c} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {frigateStatus.type === 'error' && <p className="text-xs text-red-400">{frigateStatus.message}</p>}
            </div>
          </div>

          <Separator />

          {/* RTSP Authentication */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground uppercase tracking-wider">RTSP Authentication</h4>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Auto-injected into RTSP URLs that don't already contain credentials. Leave empty for unauthenticated streams.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rtsp_username">RTSP Username</Label>
                <Input
                  id="rtsp_username"
                  value={form.rtsp_username || ''}
                  onChange={(e) => handleChange('rtsp_username', e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rtsp_password">RTSP Password</Label>
                <Input
                  id="rtsp_password"
                  type="password"
                  value={form.rtsp_password || ''}
                  onChange={(e) => handleChange('rtsp_password', e.target.value || null)}
                />
              </div>
            </div>
            </div>
          </div>

          <Separator />

          {/* Auto-Restart */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground uppercase tracking-wider">Auto-Restart</h4>
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Automatically restart cameras that crash, with exponential backoff.
            </p>
            <div className="flex items-center gap-2">
              <Switch
                id="auto_restart_enabled"
                checked={form.auto_restart_enabled}
                onCheckedChange={(v) => handleChange('auto_restart_enabled', v)}
              />
              <Label htmlFor="auto_restart_enabled">Enable auto-restart</Label>
            </div>
            {form.auto_restart_enabled && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="auto_restart_max_attempts">Max Attempts</Label>
                  <Input
                    id="auto_restart_max_attempts"
                    type="number"
                    min={0}
                    value={form.auto_restart_max_attempts}
                    onChange={(e) => handleChange('auto_restart_max_attempts', parseInt(e.target.value) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">0 = retry indefinitely</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="auto_restart_initial_delay">Initial Delay (s)</Label>
                  <Input
                    id="auto_restart_initial_delay"
                    type="number"
                    min={1}
                    value={form.auto_restart_initial_delay}
                    onChange={(e) => handleChange('auto_restart_initial_delay', parseInt(e.target.value) || 5)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="auto_restart_max_delay">Max Delay (s)</Label>
                  <Input
                    id="auto_restart_max_delay"
                    type="number"
                    min={1}
                    value={form.auto_restart_max_delay}
                    onChange={(e) => handleChange('auto_restart_max_delay', parseInt(e.target.value) || 300)}
                  />
                </div>
              </div>
            )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
