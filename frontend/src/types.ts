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
  status: 'stopped' | 'running' | 'error';
  exit_code: number | null;
  error_message: string | null;
  uptime: number | null;
  pid: number | null;
}

export interface GlobalConfig {
  host: string;
  cert: string;
  token: string;
  nvr_username: string | null;
  nvr_password: string | null;
  verbose: boolean;
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

export interface AppConfig {
  global: GlobalConfig;
  cameras: CameraConfig[];
}
