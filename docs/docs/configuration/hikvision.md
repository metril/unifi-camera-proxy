---
sidebar_position: 3
---

# Hikvision

Add a camera of type **Hikvision** from the web UI's **Add Camera** form. The
proxy connects to the camera at its `ip` address using the credentials below.

## Configuration fields

| Field | Default | Description |
|---|---|---|
| `username` | — | Camera username (required) |
| `password` | — | Camera password (required) |
| `channel` | `1` | Camera channel index |
| `substream` | `3` | Camera substream index |

Hikvision cameras also support all
[Common Camera Fields](./web-ui.md#common-camera-fields) and
[Per-Camera Common Fields](./web-ui.md#per-camera-common-fields) — set the
camera's `ip` so the proxy can reach it.

## Example

```yaml
cameras:
  - id: "c3d4e5f6"
    name: "Garage"
    type: "hikvision"
    mac: "AA:BB:CC:00:11:44"
    ip: "192.168.1.20"
    model: "UVC G4 Bullet"
    enabled: true
    username: "admin"
    password: "your-password"
```

## Hikvision DS-2DE3304W-DE

- [x] Supports full-time recording
- [ ] Supports motion events
- [ ] Supports smart detection
- Notes:
  - Change Pan/Tilt/Zoom via the brightness/saturation/hue camera settings.
