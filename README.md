# UniFi Camera Proxy

## About

This enables using non-Ubiquiti cameras within the UniFi Protect
ecosystem, particularly useful for existing RTSP-enabled cameras.
Cameras are managed through a web UI and registered as virtual
UniFi cameras in Protect.

Things that work:

* Live streaming
* Full-time recording
* Motion detection with certain cameras
* Smart Detections using [Frigate](https://github.com/blakeblackshear/frigate)

## Quick Start

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

## Authentication (OIDC)

When OIDC is configured, all `/api/` routes require a valid
session. Configure via **Global Settings -> OIDC Authentication**
in the web UI. Supports any OpenID Connect provider (tested with
Authentik).

No environment variables are used for OIDC — credentials are stored in `data/config.yaml`.

**Authentik provider setup:**

* Type: OAuth2/OpenID Connect, Client type: Confidential
* Redirect URI: `https://your-host/api/auth/callback`
* Scopes: `openid`, `profile`, `email`

## Reverse Proxy

To run behind Traefik or nginx, bind the web server to an internal address and proxy to it:

```yaml
environment:
  - BIND_PORT=8080
  - BIND_ADDRESS=127.0.0.1   # only reachable via reverse proxy
```
