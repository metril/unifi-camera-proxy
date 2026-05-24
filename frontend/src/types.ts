export interface CameraConfig {
  id: string;
  enabled: boolean;
  name: string;
  mac: string;
  ip: string;
  model: string;
  /** Optional override; derived from ``model`` on the backend when absent.
   *  Removed from the camera form in v1.7.2 — only present here for
   *  backward compat with old saved configs the API still echoes. */
  fw_version?: string;
  type: string;
  [key: string]: unknown;
}

/** One tile in a saved Live View layout: references an existing camera and
 *  positions it on the editor canvas. The player auto-fits the canvas into
 *  the viewport (letterboxing as needed) so a layout authored at
 *  ``canvas.w × canvas.h`` renders sensibly on any display. */
export interface LiveViewTile {
  camera_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LiveView {
  id: string;
  name: string;
  canvas: { w: number; h: number };
  tiles: LiveViewTile[];
  /** When set, ``/live/<id>?token=<kiosk_token>`` is accessible without
   *  OIDC. Mint/rotate via POST /api/live-views/<id>/kiosk-token; revoke
   *  via DELETE. */
  kiosk_token?: string | null;
}

export interface KioskTokenResponse {
  token: string;
  url: string;
}

export interface CameraStatus {
  id: string;
  config: CameraConfig;
  status: 'stopped' | 'running' | 'error' | 'restarting';
  exit_code: number | null;
  error_message: string | null;
  uptime: number | null;
  /** Epoch seconds when this run started. Surfaced so the UI can
   *  interpolate the displayed uptime locally at 1 Hz instead of
   *  forcing the server to push every second. */
  started_at?: number | null;
  pid: number | null;
  restart_attempt: number;
  next_restart_at: number | null;
  auto_restart_enabled: boolean;
  /** Model-derived UVC firmware string (or the user's override) that the
   *  subprocess actually reports to Protect on adopt. Shown read-only on
   *  the camera card. */
  effective_fw_version?: string;
  /** Semver field paired with ``effective_fw_version`` in the adoption
   *  hello; surfaced for debugging. Aligned with fwVersion as of v1.7.3
   *  so Protect stops asking the camera to update. */
  effective_semver?: string;
}

export interface GlobalConfig {
  host: string;
  cert: string;
  token: string;
  nvr_username: string | null;
  nvr_password: string | null;
  api_key: string | null;
  verbose: boolean;
  mqtt_host: string;
  mqtt_port: number;
  mqtt_username: string | null;
  mqtt_password: string | null;
  mqtt_prefix: string;
  mqtt_ssl: boolean;
  rtsp_username: string | null;
  rtsp_password: string | null;
  frigate_http_url: string;
  frigate_username: string | null;
  frigate_password: string | null;
  frigate_verify_ssl: boolean;
  oidc_issuer?: string;
  oidc_client_id?: string;
  oidc_client_secret?: string | null;  // write-only: sent when changing, never returned
  has_oidc?: boolean;                   // read-only: returned from server
  auto_restart_enabled: boolean;
  auto_restart_max_attempts: number;
  auto_restart_initial_delay: number;
  auto_restart_max_delay: number;
  webrtc_candidate?: string;
}

export interface FieldSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  default: unknown;
  required: boolean;
  help: string;
  choices: string[] | null;
}

export interface CameraTypeSchemas {
  types: Record<string, FieldSchema[]>;
  models: string[];
}

export interface LogEntry {
  timestamp: string;
  logger: string;
  level: string;
  message: string;
  raw: string;
  /** Client-assigned monotonic seq used as the React row key. Survives
   *  the buffer's slice(-500) trim — without it, all rows would
   *  re-render whenever the buffer fills. Only set on log-push entries;
   *  the initial logs_batch fills with index-derived keys instead. */
  _key?: number;
}

export interface AppConfig {
  global: GlobalConfig;
  cameras: CameraConfig[];
  live_views?: LiveView[];
}
