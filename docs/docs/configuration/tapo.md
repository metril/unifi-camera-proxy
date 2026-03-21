---
sidebar_position: 1
---

# Tapo
Unifi-cam-proxy has basic support for Tapo/TPlink cameras, like the C100 or C200 with PTZ. 

To control the PTZ functionality, you have to use the camera
image settings in unifi. Adjusting the contrast to anything less
than 20 pans the camera a bit to the left, anything over 80 to
the right. The brightness setting controls the tilt.

Make sure to reset the brightness/contrast setting back to
somewhere around 50 after adjusting the cameras position, to
avoid adjusting the position by accident.

## Standard
```sh
unifi-camera-proxy -H {NVR IP} -i {Camera IP} -c /client.pem -t {Adoption token} --mac 'AA:BB:CC:00:11:22'\
  tapo \
  --rtsp "rtsp://{camera_username}:{camera_password}@{camera_ip}:554"
```

## PTZ Support
```sh
unifi-camera-proxy -H {NVR IP} -i {Camera IP} -c /client.pem -t {Adoption token} --mac 'AA:BB:CC:00:11:22'\
  tapo \
  --rtsp "rtsp://{camera_username}:{camera_password}@{camera_ip}:554"\
  --password "{TP Link account Password}"
```

## Options

```text
optional arguments:
  --username USERNAME, -u USERNAME
                        Username (default: admin)
  --password PASSWORD, -p PASSWORD
                        Your TPlink app password
  --rtsp RTSP           RTSP base URL (e.g., rtsp://user:pass@192.168.1.100:554)
  --http-api HTTP_API   Specify a port number to enable the HTTP API (default: disabled)
  --snapshot-url URL, -i URL
                        HTTP endpoint to fetch snapshot image from
```

For common arguments shared by all camera types, see [Common Arguments](common).