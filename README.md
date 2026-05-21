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
* Live preview in the web UI (real-time video for every camera type)
* Mosaic cameras — tile several feeds into one UniFi camera
* Two-way audio / talkback

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

## Live Preview

A bundled [go2rtc](https://github.com/AlexxIT/go2rtc) server runs inside the
container and provides real-time video for every camera type. Toggle
**Show live preview** above the camera grid to embed a player in each running
camera's card (WebRTC with automatic MSE/HLS/MJPEG fallback).

Preview traffic is reverse-proxied through the web server under `/go2rtc/*`, so
it shares the single exposed port and the OIDC auth. WebRTC falls back to MSE
over that proxied path automatically. For the lowest-latency direct WebRTC,
optionally expose go2rtc's port `8555` (tcp + udp) in your compose file.

## GridFusion — Multi-Camera Matrix Composer

GridFusion tiles several camera feeds into a single composited stream that
registers as **one** UniFi camera (saving Protect camera slots). Open the
**GridFusion** section and click **New composition** to launch the visual
editor:

* Drag camera tiles anywhere on a canvas and resize them with handles —
  arbitrary arrangements, not just uniform grids (tiles may overlap).
* Each tile shows a **live snapshot** so you compose against the real view.
* Tiles can be existing cameras (pulled once from the shared go2rtc server) or
  raw RTSP URLs.
* Pick an output resolution (1080p/1440p/4K or custom) and quick-layout presets.

ffmpeg composites the layout **once** (a `color` base canvas + per-tile
`scale`/`overlay`) and publishes it to go2rtc; UniFi Protect and the live
preview both pull that single stream.

## Two-Way Audio (Talkback)

Set **talkback-url** on a camera to enable talkback from the UniFi Protect app.
When Protect starts a talkback session, audio is pumped via ffmpeg to that
endpoint (e.g. an RTSP back-channel or HTTP/RTMP audio-in URL on the camera).
Override **talkback-options** to match the camera's expected audio-in format.

## Reverse Proxy

To run behind Traefik or nginx, bind the web server to an internal address and proxy to it:

```yaml
environment:
  - BIND_PORT=8080
  - BIND_ADDRESS=127.0.0.1   # only reachable via reverse proxy
```
