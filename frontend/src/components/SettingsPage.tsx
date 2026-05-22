import { useEffect, useState, type ReactNode } from 'react';
import { Plug, Boxes, KeyRound, RefreshCw, Network } from 'lucide-react';
import { api } from '../api';
import type { GlobalConfig } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface SettingsPageProps {
  config: GlobalConfig;
  onSave: (config: GlobalConfig) => void;
}

type Status = { type: 'idle' | 'loading' | 'success' | 'error'; message?: string; items?: string[] };

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-5 space-y-4">
      <div>
        <h3 className="font-semibold tracking-tight">{title}</h3>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

const TABS = [
  { id: 'connection', label: 'Connection', icon: Plug },
  { id: 'integrations', label: 'Integrations', icon: Boxes },
  { id: 'streaming', label: 'Streaming', icon: Network },
  { id: 'security', label: 'Security', icon: KeyRound },
  { id: 'reliability', label: 'Reliability', icon: RefreshCw },
];

export default function SettingsPage({ config, onSave }: SettingsPageProps) {
  const [form, setForm] = useState<GlobalConfig>(config);
  const [cert, setCert] = useState<Status>({ type: 'idle' });
  const [token, setToken] = useState<Status>({ type: 'idle' });
  const [mqtt, setMqtt] = useState<Status>({ type: 'idle' });
  const [frigate, setFrigate] = useState<Status>({ type: 'idle' });

  useEffect(() => {
    setForm(config);
  }, [config]);

  const set = (field: keyof GlobalConfig, value: unknown) => setForm((p) => ({ ...p, [field]: value }));

  const genCert = async () => {
    setCert({ type: 'loading' });
    try {
      const r = await api.generateCert(form.cert);
      setCert({ type: 'success', message: `Certificate generated: ${r.path}` });
    } catch (e) {
      setCert({ type: 'error', message: e instanceof Error ? e.message : 'Failed' });
    }
  };
  const fetchToken = async () => {
    setToken({ type: 'loading' });
    try {
      const r = await api.fetchToken(form.host, form.nvr_username, form.nvr_password, form.api_key);
      set('token', r.token);
      setToken({ type: 'success', message: 'Token fetched successfully' });
    } catch (e) {
      setToken({ type: 'error', message: e instanceof Error ? e.message : 'Failed' });
    }
  };
  const testMqtt = async () => {
    setMqtt({ type: 'loading' });
    try {
      const r = await api.testMqtt(form.mqtt_host, form.mqtt_port, form.mqtt_username, form.mqtt_password, form.mqtt_ssl || false, form.mqtt_prefix || 'frigate');
      setMqtt({ type: 'success', message: r.topics.length ? `Found ${r.topics.length} topics` : 'Connected; no topics in 5s', items: r.topics });
    } catch (e) {
      setMqtt({ type: 'error', message: e instanceof Error ? e.message : 'Failed' });
    }
  };
  const testFrigate = async () => {
    setFrigate({ type: 'loading' });
    try {
      const r = await api.testFrigate(form.frigate_http_url, form.frigate_username, form.frigate_password, form.frigate_verify_ssl);
      setFrigate({ type: 'success', message: `Connected (v${r.version}). ${r.cameras.length} camera(s)`, items: r.cameras });
    } catch (e) {
      setFrigate({ type: 'error', message: e instanceof Error ? e.message : 'Failed' });
    }
  };

  const ok = (s: Status) => s.type === 'success' && <p className="text-xs text-emerald-400">{s.message}</p>;
  const err = (s: Status) => s.type === 'error' && <p className="text-xs text-red-400">{s.message}</p>;

  return (
    <div className="max-w-4xl pb-24">
      <Tabs defaultValue="connection" className="space-y-6">
        <TabsList className="bg-card/60 border border-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.id} value={t.id} className="gap-1.5 text-xs">
                <Icon className="w-3.5 h-3.5" /> {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Connection */}
        <TabsContent value="connection" className="space-y-5">
          <Section title="UniFi Protect" desc="Where the proxied cameras adopt.">
            <Field label="Protect host">
              <Input value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="192.168.1.1 or protect.local" className="font-data" />
            </Field>
            <Field label="Certificate path">
              <div className="flex gap-2">
                <Input value={form.cert} onChange={(e) => set('cert', e.target.value)} placeholder="data/client.pem" className="flex-1 font-data" />
                <Button type="button" variant="outline" size="sm" onClick={genCert} disabled={cert.type === 'loading'} className="text-emerald-400 border-emerald-600/30 hover:bg-emerald-600/10 whitespace-nowrap">
                  {cert.type === 'loading' ? 'Generating…' : 'Generate'}
                </Button>
              </div>
              {ok(cert)} {err(cert)}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="NVR username"><Input value={form.nvr_username || ''} onChange={(e) => set('nvr_username', e.target.value || null)} /></Field>
              <Field label="NVR password"><Input type="password" value={form.nvr_password || ''} onChange={(e) => set('nvr_password', e.target.value || null)} /></Field>
            </div>
            <Field label="API key" hint="Optional — used by cameras at runtime.">
              <Input type="password" value={form.api_key || ''} onChange={(e) => set('api_key', e.target.value || null)} />
            </Field>
            <Field label="Adoption token" hint="Requires username/password. Leave empty to auto-fetch on start; tokens expire after 60 min.">
              <div className="flex gap-2">
                <Input value={form.token} onChange={(e) => set('token', e.target.value)} className="flex-1 font-data text-xs" />
                <Button type="button" variant="outline" size="sm" onClick={fetchToken} disabled={token.type === 'loading' || !form.host || !form.nvr_username || !form.nvr_password} className="text-primary border-primary/30 hover:bg-primary/10 whitespace-nowrap">
                  {token.type === 'loading' ? 'Fetching…' : 'Fetch'}
                </Button>
              </div>
              {ok(token)} {err(token)}
            </Field>
            <div className="flex items-center gap-2">
              <Switch checked={form.verbose} onCheckedChange={(v) => set('verbose', v)} />
              <Label>Verbose logging</Label>
            </div>
          </Section>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations" className="space-y-5">
          <Section title="MQTT" desc="Frigate event bus for smart detections.">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Field label="MQTT host"><Input value={form.mqtt_host || ''} onChange={(e) => set('mqtt_host', e.target.value)} placeholder="mqtt.local" className="font-data" /></Field></div>
              <Field label="Port"><Input type="number" value={form.mqtt_port || 1883} onChange={(e) => { const n = parseInt(e.target.value, 10); set('mqtt_port', Number.isNaN(n) ? 1883 : Math.max(1, Math.min(65535, n))); }} className="font-data" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username"><Input value={form.mqtt_username || ''} onChange={(e) => set('mqtt_username', e.target.value || null)} /></Field>
              <Field label="Password"><Input type="password" value={form.mqtt_password || ''} onChange={(e) => set('mqtt_password', e.target.value || null)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <Field label="Topic prefix"><Input value={form.mqtt_prefix || 'frigate'} onChange={(e) => set('mqtt_prefix', e.target.value)} className="font-data" /></Field>
              <div className="flex items-center gap-2 pb-2"><Switch checked={form.mqtt_ssl || false} onCheckedChange={(v) => set('mqtt_ssl', v)} /><Label>SSL/TLS</Label></div>
            </div>
            <Button type="button" variant="outline" size="sm" className="w-full text-primary border-primary/30 hover:bg-primary/10" onClick={testMqtt} disabled={mqtt.type === 'loading' || !form.mqtt_host}>
              {mqtt.type === 'loading' ? 'Discovering…' : 'Test & discover topics'}
            </Button>
            {ok(mqtt)} {err(mqtt)}
            {mqtt.items && mqtt.items.length > 0 && (
              <div className="max-h-32 overflow-auto bg-black/30 rounded p-2">
                {mqtt.items.map((t) => <div key={t} className="text-xs text-muted-foreground font-data py-0.5">{t}</div>)}
              </div>
            )}
          </Section>
          <Section title="Frigate" desc="HTTP API for snapshots and stream auto-detection.">
            <Field label="Frigate HTTP URL"><Input value={form.frigate_http_url || ''} onChange={(e) => set('frigate_http_url', e.target.value)} placeholder="http://frigate:5000" className="font-data" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username"><Input value={form.frigate_username || ''} onChange={(e) => set('frigate_username', e.target.value || null)} /></Field>
              <Field label="Password"><Input type="password" value={form.frigate_password || ''} onChange={(e) => set('frigate_password', e.target.value || null)} /></Field>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.frigate_verify_ssl} onCheckedChange={(v) => set('frigate_verify_ssl', v)} />
              <Label>Verify SSL <span className="text-xs text-muted-foreground">(uncheck for self-signed)</span></Label>
            </div>
            <Button type="button" variant="outline" size="sm" className="w-full text-primary border-primary/30 hover:bg-primary/10" onClick={testFrigate} disabled={frigate.type === 'loading' || !form.frigate_http_url}>
              {frigate.type === 'loading' ? 'Testing…' : 'Test Frigate connection'}
            </Button>
            {ok(frigate)} {err(frigate)}
            {frigate.items && frigate.items.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {frigate.items.map((c) => <span key={c} className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded font-data">{c}</span>)}
              </div>
            )}
          </Section>
        </TabsContent>

        {/* Streaming */}
        <TabsContent value="streaming" className="space-y-5">
          <Section title="RTSP authentication" desc="Auto-injected into RTSP URLs without credentials. Leave empty for unauthenticated streams.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="RTSP username"><Input value={form.rtsp_username || ''} onChange={(e) => set('rtsp_username', e.target.value || null)} /></Field>
              <Field label="RTSP password"><Input type="password" value={form.rtsp_password || ''} onChange={(e) => set('rtsp_password', e.target.value || null)} /></Field>
            </div>
          </Section>
          <Section title="Live Wall & close-up" desc="The Live Wall plays via HLS through this server. The click-to-expand close-up uses WebRTC for sub-second latency when reachable, falling back to MSE otherwise.">
            <Field label="WebRTC candidate" hint="For the low-latency close-up: a host:port the browser can reach directly (e.g. cam.example.com:8555 or stun:8555). Forward port 8555 (TCP+UDP) to this container. Leave empty to use MSE only.">
              <Input value={form.webrtc_candidate || ''} onChange={(e) => set('webrtc_candidate', e.target.value)} placeholder="host.example.com:8555" className="font-data text-xs" />
            </Field>
          </Section>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="space-y-5">
          <Section title="OIDC authentication" desc="Configure any OpenID Connect provider (e.g. Authentik). Leave empty to disable auth.">
            <Field label="Issuer URL"><Input value={form.oidc_issuer || ''} onChange={(e) => set('oidc_issuer', e.target.value)} placeholder="https://auth.example.com/application/o/unifi/" className="font-data text-xs" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client ID"><Input value={form.oidc_client_id || ''} onChange={(e) => set('oidc_client_id', e.target.value)} className="font-data text-xs" /></Field>
              <Field label="Client secret"><Input type="password" value={form.oidc_client_secret || ''} onChange={(e) => set('oidc_client_secret', e.target.value || null)} placeholder={config.has_oidc ? 'Leave blank to keep existing' : ''} autoComplete="new-password" /></Field>
            </div>
          </Section>
        </TabsContent>

        {/* Reliability */}
        <TabsContent value="reliability" className="space-y-5">
          <Section title="Auto-restart" desc="Restart crashed cameras automatically with exponential backoff.">
            <div className="flex items-center gap-2">
              <Switch checked={form.auto_restart_enabled} onCheckedChange={(v) => set('auto_restart_enabled', v)} />
              <Label>Enable auto-restart</Label>
            </div>
            {form.auto_restart_enabled && (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Max attempts" hint="0 = infinite"><Input type="number" min={0} value={form.auto_restart_max_attempts} onChange={(e) => set('auto_restart_max_attempts', parseInt(e.target.value) || 0)} className="font-data" /></Field>
                <Field label="Initial delay (s)"><Input type="number" min={1} value={form.auto_restart_initial_delay} onChange={(e) => set('auto_restart_initial_delay', parseInt(e.target.value) || 5)} className="font-data" /></Field>
                <Field label="Max delay (s)"><Input type="number" min={1} value={form.auto_restart_max_delay} onChange={(e) => set('auto_restart_max_delay', parseInt(e.target.value) || 300)} className="font-data" /></Field>
              </div>
            )}
          </Section>
        </TabsContent>
      </Tabs>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 right-0 left-60 border-t border-border bg-background/90 backdrop-blur-md px-8 py-3 flex justify-end gap-3 z-10">
        <Button onClick={() => onSave(form)}>Save changes</Button>
      </div>
    </div>
  );
}
