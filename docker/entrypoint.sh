#!/bin/sh

# If the first argument is the web server, run it directly
if [ "$1" = "unifi-cam-proxy-web" ]; then
  shift
  exec unifi-cam-proxy-web "$@"
fi

# Legacy environment variable support for single RTSP camera
if [ ! -z "${RTSP_URL:-}" ] && [ ! -z "${HOST}" ] && [ ! -z "${TOKEN}" ]; then
  echo "Using RTSP stream from $RTSP_URL"
  exec unifi-cam-proxy --host "$HOST" --name "${NAME:-unifi-cam-proxy}" --mac "${MAC:-'AA:BB:CC:00:11:22'}" --cert /client.pem --token "$TOKEN" rtsp -s "$RTSP_URL"
fi

exec "$@"
