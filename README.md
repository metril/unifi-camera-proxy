# UniFi Camera Proxy

## About

This enables using non-Ubiquiti cameras within the UniFi Protect ecosystem, particularly useful for existing RTSP-enabled cameras. Cameras are managed through a web UI and registered as virtual UniFi cameras in Protect.

Things that work:
* Live streaming
* Full-time recording
* Motion detection with certain cameras
* Smart Detections using [Frigate](https://github.com/blakeblackshear/frigate)

## Quick Start

```yaml
services:
  unifi-cam-proxy:
    image: ghcr.io/metril/unifi-cam-proxy:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - "./data:/app/data"
    environment:
      - BIND_PORT=8080        # optional, default: 8080
      - BIND_ADDRESS=0.0.0.0  # optional, default: 0.0.0.0
```

Open `http://<host>:8080` to access the web UI. Configure your UniFi Protect host, generate a certificate, fetch an adoption token, then add cameras.

## Environment Variables

### Web UI (`unifi-cam-proxy-web`)

| Variable | Default | Description |
|---|---|---|
| `BIND_PORT` | `8080` | Port the web server listens on |
| `BIND_ADDRESS` | `0.0.0.0` | IP address the web server binds to. Set to a specific interface IP to restrict access (e.g. `127.0.0.1` when behind a reverse proxy). |

### Legacy single-camera mode (`unifi-cam-proxy`)

These variables are used by the entrypoint when running a single RTSP camera without the web UI (the old per-container approach). **The web UI is recommended instead.**

| Variable | Default | Required | Description |
|---|---|---|---|
| `HOST` | — | Yes | UniFi Protect host IP or hostname |
| `TOKEN` | — | Yes | Adoption token from Protect |
| `RTSP_URL` | — | Yes | RTSP stream URL for the camera |
| `NAME` | `unifi-cam-proxy` | No | Display name shown in Protect |
| `MAC` | `AA:BB:CC:00:11:22` | No | MAC address assigned to the virtual camera. Must be unique per camera. |

> **Note:** All three of `HOST`, `TOKEN`, and `RTSP_URL` must be set for legacy mode to activate. If any is missing the container falls through to `exec "$@"`.

## Authentication (OIDC)

When OIDC is configured, all `/api/` routes require a valid session. Configure via **Global Settings → OIDC Authentication** in the web UI. Supports any OpenID Connect provider (tested with Authentik).

No environment variables are used for OIDC — credentials are stored in `data/config.yaml`.

**Authentik provider setup:**
- Type: OAuth2/OpenID Connect, Client type: Confidential
- Redirect URI: `https://your-host/api/auth/callback`
- Scopes: `openid`, `profile`, `email`

## Reverse Proxy

To run behind Traefik or nginx, bind the web server to an internal address and proxy to it:

```yaml
environment:
  - BIND_PORT=8080
  - BIND_ADDRESS=127.0.0.1   # only reachable via reverse proxy
```

## Donations

If you would like to make a donation to support development, please use [Github Sponsors](https://github.com/sponsors/keshavdv).
