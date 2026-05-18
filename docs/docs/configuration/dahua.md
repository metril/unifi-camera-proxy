---
sidebar_position: 3
---

# Dahua/Lorex

Add a camera of type **Dahua** (or **Lorex**, which uses the same integration)
from the web UI's **Add Camera** form. The proxy connects to the camera at its
`ip` address using the credentials below.

## Configuration fields

| Field | Default | Description |
|---|---|---|
| `username` | — | Camera username (required) |
| `password` | — | Camera password (required) |
| `channel` | `1` | Camera channel |
| `snapshot_channel` | channel − 1 | Snapshot channel |
| `main_stream` | `0` | Main stream subtype index |
| `sub_stream` | `1` | Sub stream subtype index |
| `motion_index` | snapshot channel | VideoMotion event index |
| `ptz` | `false` | Set if the camera has PTZ support |

Dahua/Lorex cameras also support all
[Common Camera Fields](./web-ui.md#common-camera-fields) and
[Per-Camera Common Fields](./web-ui.md#per-camera-common-fields) — set the
camera's `ip` so the proxy can reach it.

## Example

```yaml
cameras:
  - id: "d4e5f6a7"
    name: "Backyard"
    type: "dahua"
    mac: "AA:BB:CC:00:11:55"
    ip: "192.168.1.30"
    model: "UVC G4 Bullet"
    enabled: true
    username: "admin"
    password: "your-password"
```

## Lorex LNB4321B

- [x] Supports full-time recording
- [x] Supports motion events
- [ ] Supports smart detection
- Notes:
  - If the camera has no audio, set `ffmpeg_args` to inject a silent track:
    `-f lavfi -i anullsrc -c:v copy -ar 32000 -ac 1 -codec:a aac -b:a 32k`
