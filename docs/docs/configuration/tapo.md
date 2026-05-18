---
sidebar_position: 1
---

# Tapo

unifi-camera-proxy has basic support for TP-Link Tapo cameras, such as the C100
or the C200 with PTZ. Add a camera of type **Tapo** from the web UI's
**Add Camera** form.

To control PTZ, use the camera image settings in UniFi Protect: setting the
contrast below 20 pans the camera left, above 80 pans it right, and the
brightness setting controls tilt. Reset brightness/contrast back to around 50
after positioning to avoid moving the camera by accident.

## Configuration fields

| Field | Default | Description |
|---|---|---|
| `rtsp` | — | RTSP base URL, e.g. `rtsp://user:pass@192.168.1.100:554` (required) |
| `username` | `admin` | Camera username |
| `password` | — | Your TP-Link app password (required for PTZ control) |
| `snapshot_url` | — | HTTP endpoint to fetch snapshot images from (optional) |
| `http_api` | `0` | Port that exposes an HTTP API for motion triggers — `0` disables it |

Tapo cameras also support all
[Common Camera Fields](./web-ui.md#common-camera-fields) and
[Per-Camera Common Fields](./web-ui.md#per-camera-common-fields).

## Example

```yaml
cameras:
  - id: "b8c9d0e1"
    name: "Nursery"
    type: "tapo"
    mac: "AA:BB:CC:00:11:99"
    ip: "192.168.1.70"
    model: "UVC G4 Bullet"
    enabled: true
    rtsp: "rtsp://camera_user:camera_pass@192.168.1.70:554"
    password: "your-tplink-app-password"
```
