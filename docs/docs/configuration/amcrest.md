---
sidebar_position: 3
---

# Amcrest

Amcrest cameras use the same integration as Dahua. Add a camera of type
**Amcrest** from the web UI's **Add Camera** form. The proxy connects to the
camera at its `ip` address using the credentials below.

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

Amcrest cameras also support all
[Common Camera Fields](./web-ui.md#common-camera-fields) and
[Per-Camera Common Fields](./web-ui.md#per-camera-common-fields) — set the
camera's `ip` so the proxy can reach it.

## Example

```yaml
cameras:
  - id: "a7b8c9d0"
    name: "Patio"
    type: "amcrest"
    mac: "AA:BB:CC:00:11:88"
    ip: "192.168.1.60"
    model: "UVC G4 Bullet"
    enabled: true
    username: "admin"
    password: "your-password"
    motion_index: 0
    snapshot_channel: 1
    ffmpeg_args: '-c:a copy -c:v copy -bsf:v "h264_metadata=tick_rate=30000/1001"'
```

## Amcrest IP8M-T2599E

- [x] Supports full-time recording
- [x] Supports motion events
- [ ] Supports smart detection
- Notes:
  - Camera configuration:
    - Video codec must be H.264 (H.265/HEVC is not supported).
    - Audio codec should be AAC. If not, adjust `ffmpeg_args` to re-encode to AAC.
    - Ensure the sub stream is enabled.
    - If desired, enable motion detection with the desired anti-dither and
      detection area.
  - The `-bsf:v` parameter is needed to make live video work. The first
    `tick_rate` value should be `fps * 2000`.
