---
sidebar_position: 4
---

# Reolink

Add a camera of type **Reolink** from the web UI's **Add Camera** form. The
proxy connects to the camera at its `ip` address using the credentials below.

## Configuration fields

| Field | Default | Description |
|---|---|---|
| `username` | — | Camera username (required) |
| `password` | — | Camera password (required) |
| `channel` | `0` | Camera channel (not currently used) |
| `stream` | `main` | Stream profile for the higher-quality stream: `main` or `sub` |
| `substream` | `sub` | Stream profile for the lower-quality stream: `main` or `sub` |

Reolink cameras also support all
[Common Camera Fields](./web-ui.md#common-camera-fields) and
[Per-Camera Common Fields](./web-ui.md#per-camera-common-fields) — set the
camera's `ip` so the proxy can reach it.

## Example

```yaml
cameras:
  - id: "e5f6a7b8"
    name: "Side Gate"
    type: "reolink"
    mac: "AA:BB:CC:00:11:66"
    ip: "192.168.1.40"
    model: "UVC G4 Bullet"
    enabled: true
    username: "admin"
    password: "your-password"
    stream: "main"
```

## RLC-410-5MP

- [x] Supports full-time recording
- [x] Supports motion events
- [ ] Supports smart detection
- Notes:
  - When using the `sub` substream, set `tick_rate=30000/1001` in `ffmpeg_args`
    since the stream is limited to a max of 15 fps. For example:
    `-c:v copy -bsf:v "h264_metadata=tick_rate=60000/1001" -ar 32000 -ac 1 -codec:a aac -b:a 32k`
