---
sidebar_position: 1
---

# RTSP

Most generic cameras are supported via the RTSP integration. Add a camera of
type **RTSP** from the web UI's **Add Camera** form, then fill in the fields
below. Depending on your camera you may need specific transcoding settings to
make live streaming smooth — check whether your camera model has a dedicated
page in the Configuration section first.

## Configuration fields

| Field | Default | Description |
|---|---|---|
| `video1` | — | RTSP source URL for the high-quality stream (required) |
| `video2` | — | RTSP source URL for the medium-quality stream (optional, defaults to `video1`) |
| `video3` | — | RTSP source URL for the low-quality stream (optional, defaults to `video1`) |
| `snapshot_url` | — | HTTP endpoint to fetch snapshot images from (optional; if unset, snapshots are captured from `video3`) |
| `http_api` | `0` | Port that exposes an HTTP API for motion triggers — `0` disables it. Endpoints: `GET /start_motion`, `GET /stop_motion` |

RTSP cameras also support all the
[Common Camera Fields](./web-ui.md#common-camera-fields) (transcoding and stream
quality) and the [Per-Camera Common Fields](./web-ui.md#per-camera-common-fields).

## Example

```yaml
cameras:
  - id: "a1b2c3d4"
    name: "Driveway"
    type: "rtsp"
    mac: "AA:BB:CC:00:11:22"
    model: "UVC G4 Bullet"
    enabled: true
    video1: "rtsp://192.168.1.10:554/stream1"
    video2: "rtsp://192.168.1.10:554/stream2"
    video3: "rtsp://192.168.1.10:554/stream3"
```

## Hardware acceleration

To offload transcoding to a GPU, set the `ffmpeg_args`
[Common Camera Field](./web-ui.md#common-camera-fields) to something like:

```text
-hwaccel vaapi -hwaccel_device /dev/dri/renderD128 -hwaccel_output_format yuv420p
```
