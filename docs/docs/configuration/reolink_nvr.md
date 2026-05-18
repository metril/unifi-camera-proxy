---
sidebar_position: 5
---

# Reolink NVR

Add a camera of type **Reolink NVR** from the web UI's **Add Camera** form. The
proxy connects to the Reolink NVR at its `ip` address and proxies one of its
channels.

## Configuration fields

| Field | Default | Description |
|---|---|---|
| `username` | — | NVR username (required) |
| `password` | — | NVR password (required) |
| `channel` | — | NVR camera channel (required) |

Reolink NVR cameras also support all
[Common Camera Fields](./web-ui.md#common-camera-fields) and
[Per-Camera Common Fields](./web-ui.md#per-camera-common-fields) — set the
`ip` to the NVR's address.

## Example

```yaml
cameras:
  - id: "f6a7b8c9"
    name: "Shop Camera 3"
    type: "reolink_nvr"
    mac: "AA:BB:CC:00:11:77"
    ip: "192.168.1.50"
    model: "UVC G4 Bullet"
    enabled: true
    username: "admin"
    password: "your-password"
    channel: 3
```

## NVR (Reolink RLN16-410)

- [x] Supports full-time recording
- [x] Supports motion events
- [ ] Supports smart detection
- Notes:
  - Camera/channel IDs are zero-based.
