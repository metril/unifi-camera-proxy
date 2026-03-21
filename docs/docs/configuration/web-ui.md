---
sidebar_position: 1
---

# Web UI

## Overview

The Web UI (`unifi-camera-proxy-web`) is the recommended way to
run unifi-camera-proxy. It provides a browser-based interface to
manage multiple cameras from a single container. Configuration
is persisted to a YAML file, and cameras are started as managed
subprocesses.

Key features:

- Add, edit, start, stop, and restart cameras from the browser
- Global settings for UniFi Protect host, adoption token, certificate, MQTT, and Frigate
- Real-time log streaming and diagnostics via WebSocket
- OIDC authentication support
- Automatic certificate generation

## Docker Compose

```yaml
services:
  unifi-camera-proxy:
    image: ghcr.io/metril/unifi-camera-proxy:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - "./data:/app/data"
    environment:
      - BIND_PORT=8080        # optional, default: 8080
      - BIND_ADDRESS=0.0.0.0  # optional, default: 0.0.0.0
```

Open `http://<host>:8080` to access the web UI. Configure your
UniFi Protect host, generate a certificate, fetch an adoption
token, then add cameras.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BIND_PORT` | `8080` | Port the web server listens on |
| `BIND_ADDRESS` | `0.0.0.0` | IP address the web server binds to |

These can also be passed as CLI arguments `--port` and `--host` to `unifi-camera-proxy-web`.

## CLI Arguments

| Argument | Default | Description |
|---|---|---|
| `--config` | `/app/data/config.yaml` | Path to the YAML config file |
| `--port` | `8080` (env: `BIND_PORT`) | Web server port |
| `--host` | `0.0.0.0` (env: `BIND_ADDRESS`) | Web server bind address |
| `--verbose` / `-v` | off | Enable debug logging |

## Config File Structure

The config file (default: `/app/data/config.yaml`) is a YAML
document with two top-level keys: `global` and `cameras`.

```yaml
global:
  host: "192.168.1.1"             # UniFi Protect NVR IP
  cert: "/app/data/client.pem"    # Path to client certificate
  token: "your-adoption-token"    # Adoption token from Protect
  nvr_username: ""                # NVR username (for auto token fetch)
  nvr_password: ""                # NVR password (for auto token fetch)
  api_key: ""                     # UniFi Protect API key (optional)
  verbose: false

  # MQTT settings (used by Frigate cameras)
  mqtt_host: ""
  mqtt_port: 1883
  mqtt_username: ""
  mqtt_password: ""
  mqtt_prefix: "frigate"
  mqtt_ssl: false

  # RTSP credential injection
  rtsp_username: ""
  rtsp_password: ""

  # Frigate HTTP API
  frigate_http_url: ""
  frigate_username: ""
  frigate_password: ""
  frigate_verify_ssl: true

  # OIDC authentication
  oidc_issuer: ""
  oidc_client_id: ""
  oidc_client_secret: ""

cameras:
  - id: "a1b2c3d4"
    name: "Front Door"
    type: "frigate"
    mac: "AA:BB:CC:00:11:22"
    model: "UVC G4 Bullet"
    enabled: true
    frigate_camera: "front_door"
    mqtt_host: "mqtt.local"
    # ... additional type-specific fields
```

Global settings (host, cert, token, MQTT, Frigate, RTSP
credentials) apply to all cameras unless overridden per camera.
Each camera entry specifies a `type` (e.g., `rtsp`, `frigate`,
`reolink`, `dahua`, `hikvision`, `tapo`, `reolink_nvr`,
`amcrest`, `lorex`) and its type-specific arguments.

## OIDC Authentication

When OIDC is configured, all `/api/` routes require a valid
session token. OIDC credentials are stored in the config file
under the `global` section -- no environment variables are
needed.

Required fields:

| Field | Description |
|---|---|
| `oidc_issuer` | OpenID Connect issuer URL |
| `oidc_client_id` | OAuth2 client ID |
| `oidc_client_secret` | OAuth2 client secret |

These can be configured through the **Global Settings** page in the web UI under **OIDC Authentication**.

### Authentik Example

When using Authentik as your OIDC provider:

- **Provider type:** OAuth2/OpenID Connect
- **Client type:** Confidential
- **Redirect URI:** `https://your-host/api/auth/callback`
- **Scopes:** `openid`, `profile`, `email`

## API Reference

The web server exposes a REST API. When OIDC is enabled, all
`/api/` endpoints (except `/api/auth/*`) require a `Bearer`
token in the `Authorization` header.

### Configuration

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/config` | Get full configuration (OIDC secret is redacted) |
| `PUT` | `/api/config/global` | Update global settings |

### Camera Management

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/cameras` | List all cameras with status |
| `POST` | `/api/cameras` | Add a new camera |
| `GET` | `/api/cameras/{id}` | Get a single camera's status |
| `PUT` | `/api/cameras/{id}` | Update a camera's config |
| `DELETE` | `/api/cameras/{id}` | Delete a camera (stops it first) |

### Camera Control

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/cameras/{id}/start` | Start a camera |
| `POST` | `/api/cameras/{id}/stop` | Stop a camera |
| `POST` | `/api/cameras/{id}/restart` | Restart a camera |
| `GET` | `/api/cameras/start-all` | Start all cameras |
| `GET` | `/api/cameras/stop-all` | Stop all cameras |

### Monitoring

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/cameras/{id}/logs` | Get camera log buffer |
| `GET` | `/api/cameras/{id}/diagnostics` | Get camera diagnostics |
| `GET` | `/api/cameras/{id}/snapshot` | Get latest snapshot (Frigate cameras only) |
| `GET` | `/api/cameras/{id}/ws` | WebSocket for real-time logs and diagnostics |

### Tools

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/camera-types` | List available camera types and their parameter schemas |
| `POST` | `/api/generate-cert` | Generate a UniFi-compatible SSL certificate |
| `POST` | `/api/fetch-token` | Fetch adoption token from UniFi Protect NVR |
| `POST` | `/api/test-mqtt` | Test MQTT connection and discover topics |
| `POST` | `/api/test-rtsp` | Test RTSP stream connectivity via ffprobe |
| `POST` | `/api/test-frigate` | Test Frigate HTTP API and list cameras |
| `POST` | `/api/detect-frigate-camera` | Auto-detect camera settings from Frigate |

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/login` | Initiate OIDC login flow |
| `GET` | `/api/auth/callback` | OIDC callback (handles code exchange) |
| `POST` | `/api/auth/logout` | Invalidate session token |
| `GET` | `/api/auth/end-session` | Logout and redirect to OIDC provider end-session |
