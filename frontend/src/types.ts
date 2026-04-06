export interface CameraConfig {
  id: string;
  enabled: boolean;
  name: string;
  mac: string;
  ip: string;
  model: string;
  fw_version: string;
  type: string;
  [key: string]: unknown;
}

export interface CameraStatus {
  id: string;
  config: CameraConfig;
  status: 'stopped' | 'running' | 'error' | 'restarting';
  exit_code: number | null;
  error_message: string | null;
  uptime: number | null;
  pid: number | null;
  restart_attempt: number;
  next_restart_at: number | null;
  auto_restart_enabled: boolean;
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
}

export interface AppConfig {
  global: GlobalConfig;
  cameras: CameraConfig[];
}
