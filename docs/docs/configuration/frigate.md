---
sidebar_position: 2
---

# Frigate

If your camera model is not listed specifically below, try the following:

- [x] Supports full time recording
- [ ] Supports motion events
- [x] Supports smart detection

```sh
unifi-camera-proxy --mac '{unique MAC}' -H {NVR IP} -i {camera IP} -c /client.pem -t {Adoption token} \
    frigate \
    -s {rtsp source} \
    --mqtt-host {mqtt host} \
    --frigate-camera {Name of camera in frigate}
```

## Options

```text
optional arguments:
  --ffmpeg-args FFMPEG_ARGS, -f FFMPEG_ARGS
                        Transcoding args for `ffmpeg -i <src> <args> <dst>`
  --rtsp-transport {tcp,udp,http,udp_multicast}
                        RTSP transport protocol used by stream
  --source SOURCE, -s SOURCE
                        Stream source
  --video1 URL          High-quality stream source (preferred over --source)
  --video2 URL          Medium-quality stream source
  --video3 URL          Low-quality stream source
  --http-api HTTP_API   Specify a port number to enable the HTTP API (default: disabled)
  --snapshot-url SNAPSHOT_URL, -i SNAPSHOT_URL
                        HTTP endpoint to fetch snapshot image from
  --mqtt-host MQTT_HOST
                        MQTT server
  --mqtt-port MQTT_PORT
                        MQTT port
  --mqtt-prefix MQTT_PREFIX
                        Topic prefix
  --mqtt-ssl            Enable MQTT TLS/SSL
  --frigate-camera FRIGATE_CAMERA
                        Name of camera in frigate
  --frigate-http-url URL
                        Frigate HTTP API base URL for snapshot fetching and auto-detection
  --frigate-username USER
                        Frigate API authentication username (needed when behind reverse proxy)
  --frigate-password PASS
                        Frigate API authentication password (needed when behind reverse proxy)
  --no-frigate-verify-ssl
                        Skip SSL certificate verification for Frigate API requests
  --mqtt-username USER  MQTT authentication username
  --mqtt-password PASS  MQTT authentication password
  --camera-width WIDTH  Camera frame width in pixels (default: 1920)
  --camera-height HEIGHT
                        Camera frame height in pixels (default: 1080)
  --frigate-detect-width WIDTH
                        Frigate detection frame width in pixels (default: 1280)
  --frigate-detect-height HEIGHT
                        Frigate detection frame height in pixels (default: 720)
  --frigate-time-sync-ms MS
                        Time synchronization offset in milliseconds (default: 0)
```

## Auto-detection

When `--frigate-http-url` is set, camera settings such as detect
dimensions, FPS, and stream URLs are automatically fetched from
Frigate's config API. This means you can omit `--source` /
`--video1` and let the proxy discover stream URLs from your
Frigate configuration.

## Docker Compose

```yaml
services:
  unifi-camera-proxy:
    image: ghcr.io/metril/unifi-camera-proxy:latest
    restart: unless-stopped
    volumes:
      - "./client.pem:/client.pem"
    command: >-
        unifi-camera-proxy
        --host {NVR IP}
        --mac '{unique MAC}'
        --cert /client.pem
        --token {Adoption token}
        frigate
        -s {rtsp source}
        --mqtt-host {mqtt host}
        --frigate-camera {camera name}
```

For common arguments shared by all camera types, see [Common Arguments](common).
