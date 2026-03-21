---
sidebar_position: 2
---

# Common Arguments

These arguments are shared by all camera types when using the legacy CLI mode (`unifi-camera-proxy`). In Web UI mode, the equivalent settings are configured through the global settings and per-camera configuration pages.

## Global Arguments

These are parsed by the main `unifi-camera-proxy` command, before the camera type subcommand.

| Argument | Short | Default | Required | Description |
|---|---|---|---|---|
| `--host` | `-H` | -- | Yes | UniFi Protect NVR IP address and port |
| `--cert` | `-c` | `client.pem` | Yes | Path to client SSL certificate |
| `--token` | `-t` | -- | No | Adoption token (auto-fetched if NVR credentials are provided) |
| `--mac` | `-m` | `AABBCCDDEEFF` | No | MAC address for the virtual camera. Must be unique per camera. |
| `--ip` | `-i` | `192.168.1.10` | No | IP address of camera (displayed in UI, used by Tapo/Hikvision) |
| `--name` | `-n` | `unifi-camera-proxy` | No | Camera name shown in Protect |
| `--model` | -- | `UVC G4 Bullet` | No | Hardware model to identify as (see supported models below) |
| `--fw-version` | `-f` | `UVC.S2L.v4.23.8.67...` | No | Firmware version string |
| `--nvr-username` | -- | -- | No | NVR username (for automatic token fetch) |
| `--nvr-password` | -- | -- | No | NVR password (for automatic token fetch) |
| `--api-key` | -- | -- | No | UniFi Protect API key |
| `--verbose` | `-v` | off | No | Increase output verbosity |

## Camera Type Arguments

These arguments are available on all camera type subcommands (e.g., `unifi-camera-proxy ... rtsp <args>`, `unifi-camera-proxy ... frigate <args>`).

### FFmpeg and Streaming

| Argument | Short | Default | Description |
|---|---|---|---|
| `--ffmpeg-args` | `-f` | `-c:v copy -ar 32000 -ac 1 -codec:a aac -b:a 32k` | Transcoding args for `ffmpeg -i <src> <args> <dst>` |
| `--ffmpeg-base-args` | `-b` | -- | Base args for `ffmpeg <base_args> -i <src> <args> <dst>` |
| `--rtsp-transport` | -- | `tcp` | RTSP transport protocol. Choices: `tcp`, `udp`, `http`, `udp_multicast` |
| `--format` | -- | `flv` | FFmpeg output format |
| `--loglevel` | -- | `error` | FFmpeg log level. Choices: `trace`, `debug`, `verbose`, `info`, `warning`, `error`, `fatal`, `panic`, `quiet` |
| `--timestamp-modifier` | -- | `90` | Timestamp correction factor |

### Video Quality

| Argument | Default | Description |
|---|---|---|
| `--video1-bitrate` | `6000` | Max bitrate for the high quality stream in kbps |
| `--video1-fps` | `30` | FPS for the high quality stream |
| `--video2-bitrate` | `1500` | Max bitrate for the medium quality stream in kbps |
| `--video2-fps` | `15` | FPS for the medium quality stream |
| `--video3-bitrate` | `750` | Max bitrate for the low quality stream in kbps |
| `--video3-fps` | `15` | FPS for the low quality stream |

### Diagnostics

| Argument | Default | Description |
|---|---|---|
| `--diagnostics-port` | `0` | Port for the diagnostics HTTP API. `0` disables the diagnostics server. |

## Supported Models

The `--model` argument accepts the following values:

- **G6 Series (8MP/4K):** UVC G6 Bullet, UVC G6 Dome, UVC G6 Turret, UVC G6 Instant, UVC G6 PTZ, UVC G6 Pro Bullet, UVC G6 180
- **AI Series:** UVC AI 360, UVC AI Bullet, UVC AI Pro, UVC AI THETA, UVC AI DSLR
- **G5 Series (5-8MP):** UVC G5 Bullet, UVC G5 Dome, UVC G5 Dome Ultra, UVC G5 Turret Ultra, UVC G5 Flex, UVC G5 Pro, UVC G5 PTZ
- **G4 Series (4-8MP):** UVC G4 Bullet, UVC G4 Pro, UVC G4 PTZ, UVC G4 Doorbell, UVC G4 Doorbell Pro, UVC G4 Doorbell Pro PoE, UVC G4 Dome, UVC G4 Instant
- **G3 Series (2MP/1080p):** UVC G3, UVC G3 Battery, UVC G3 Dome, UVC G3 Micro, UVC G3 Mini, UVC G3 Instant, UVC G3 Pro, UVC G3 Flex
- **Legacy:** UVC, UVC Pro, UVC Dome, UVC Micro, AFi VC, Vision Pro
