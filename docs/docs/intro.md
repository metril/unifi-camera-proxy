---
slug: /
sidebar_position: 1
---

# Installation

unifi-camera-proxy runs as a single Docker container. The web UI lets you add
and manage multiple cameras from one place — each camera is configured through
your browser and registered as a virtual UniFi camera in Protect, with all
settings persisted to a YAML file.

## Prerequisites

### Adoption Token

In order to add a camera to Protect, you must first generate an adoption token.
The token is only valid for 60 minutes.
You will need to re-generate a new one if it expires during your initial setup.

Open `https://NVR_IP/proxy/protect/api/cameras/manage-payload` and copy the
token field.

You can also let the proxy fetch a token automatically by entering your NVR
username and password in **Global Settings**.

## Docker Compose

```yaml
services:
  unifi-camera-proxy:
    image: ghcr.io/metril/unifi-camera-proxy:latest
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - "./data:/app/data"
    environment:
      BIND_ADDRESS: "0.0.0.0"
```

Once running, open `http://localhost:8080` in your browser to add and manage
cameras.

## Next steps

See [Web UI](./configuration/web-ui.md) for global settings, the configuration
file format, and the REST API — then pick your camera's integration type from
the Configuration section.
