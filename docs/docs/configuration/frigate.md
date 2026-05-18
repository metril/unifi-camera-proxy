---
sidebar_position: 2
---

# Frigate

The Frigate integration bridges
[Frigate](https://github.com/blakeblackshear/frigate) motion and
smart-detection events into UniFi Protect over MQTT, and can pull event
snapshots from Frigate's HTTP API.

- [x] Supports full-time recording
- [x] Supports motion events
- [x] Supports smart detection (person, vehicle)

Add a camera of type **Frigate** from the web UI's **Add Camera** form. MQTT
and Frigate connection settings can be set once in **Global Settings** and
overridden per camera.

## Configuration fields

| Field | Default | Description |
|---|---|---|
| `frigate_camera` | — | Name of the camera in Frigate (required) |
| `mqtt_host` | — | MQTT server host (required; may come from Global Settings) |
| `mqtt_port` | `1883` | MQTT server port |
| `mqtt_username` | — | MQTT authentication username |
| `mqtt_password` | — | MQTT authentication password |
| `mqtt_ssl` | `false` | Enable SSL/TLS for the MQTT connection |
| `mqtt_prefix` | `frigate` | MQTT topic prefix |
| `frigate_http_url` | — | Frigate HTTP API URL (e.g. `http://frigate:5000`). When set, snapshots are fetched over HTTP instead of MQTT |
| `frigate_username` | — | Frigate HTTP API username |
| `frigate_password` | — | Frigate HTTP API password |
| `no_frigate_verify_ssl` | `false` | Trust self-signed SSL certificates for the Frigate HTTP API |
| `camera_width` | `1920` | Camera frame width in pixels |
| `camera_height` | `1080` | Camera frame height in pixels |
| `frigate_detect_width` | `1280` | Frigate detection frame width in pixels |
| `frigate_detect_height` | `720` | Frigate detection frame height in pixels |
| `frigate_time_sync_ms` | `0` | Offset (ms) applied to Frigate event timestamps. Positive values shift timestamps backward to compensate for Frigate event delay relative to the video |

Frigate cameras stream over RTSP, so they also use the RTSP
[`video1`/`video2`/`video3` and snapshot fields](./rtsp.md#configuration-fields)
— a `video1` stream URL is required — plus all
[Common Camera Fields](./web-ui.md#common-camera-fields) and
[Per-Camera Common Fields](./web-ui.md#per-camera-common-fields).

## Auto-detection

When `frigate_http_url` is set, the detection frame dimensions and FPS are
fetched automatically from Frigate's config API, overriding the
`frigate_detect_width` / `frigate_detect_height` defaults and the per-stream
FPS values.

## Example

```yaml
cameras:
  - id: "b2c3d4e5"
    name: "Front Door"
    type: "frigate"
    mac: "AA:BB:CC:00:11:33"
    model: "UVC G4 Bullet"
    enabled: true
    frigate_camera: "front_door"
    mqtt_host: "mqtt.local"
    frigate_http_url: "http://frigate:5000"
    video1: "rtsp://192.168.1.10:554/main"
```
