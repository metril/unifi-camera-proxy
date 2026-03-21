---
sidebar_position: 1
---

# RTSP

Most generic cameras are supported via the RTSP integration.
Depending on your camera, you might need specific flags to make live-streaming smoother.
Check for your specific camera model in the docs before trying this.

```sh
unifi-cam-proxy -H {NVR IP} -i {Camera IP} -c /client.pem -t {Adoption token} \
  rtsp \
  -s {rtsp stream}
```

## Options

```text
optional arguments:
  --source SOURCE, -s SOURCE
                        Stream source (deprecated, use --video1/2/3 instead)
  --video1 URL          High-quality stream source (preferred over --source)
  --video2 URL          Medium-quality stream source
  --video3 URL          Low-quality stream source
  --snapshot-url URL    Custom HTTP endpoint for snapshots
  --http-api PORT       Enable HTTP API for motion triggers on the given port
                        (endpoints: GET /start_motion, GET /stop_motion)
  --ffmpeg-args FFMPEG_ARGS, -f FFMPEG_ARGS
                        Transcoding args for `ffmpeg -i <src> <args> <dst>`
  --rtsp-transport {tcp,udp,http,udp_multicast}
                        RTSP transport protocol used by stream
```

:::note

`--source` is deprecated. Use `--video1`, `--video2`, and `--video3` to specify individual stream sources. This gives you explicit control over which streams map to each quality level in UniFi Protect.

:::

## Docker Compose

```yaml
services:
  unifi-cam-proxy:
    image: ghcr.io/metril/unifi-camera-proxy:latest
    restart: unless-stopped
    volumes:
      - "./client.pem:/client.pem"
    command: >-
        unifi-cam-proxy
        --host {NVR IP}
        --cert /client.pem
        --token {Adoption token}
        rtsp
        --video1 rtsp://192.168.1.10:554/stream1
        --video2 rtsp://192.168.1.10:554/stream2
        --video3 rtsp://192.168.1.10:554/stream3
```

## Hardware Acceleration

```sh
unifi-cam-proxy -H {NVR IP} -i {Camera IP} -c /client.pem -t {Adoption token} \
  rtsp \
  -s {rtsp stream} \
  --ffmpeg-args='-hwaccel vaapi -hwaccel_device /dev/dri/renderD128 -hwaccel_output_format yuv420p'
```
