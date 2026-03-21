---
sidebar_position: 4
---

# Reolink

## Generic

If your camera model is not listed specifically below, try the following:

```sh
unifi-camera-proxy -H {NVR IP} -i {camera IP} -c /client.pem -t {Adoption token} \
    reolink \
    -u {username} \
    -p {password} \
    -s "main" \
    --ffmpeg-args='-c:v copy -bsf:v "h264_metadata=tick_rate=60000/1001" -ar 32000 -ac 1 -codec:a aac -b:a 32k'
```

## Options

```text
optional arguments:
  -h, --help            show this help message and exit
  --ffmpeg-args FFMPEG_ARGS, -f FFMPEG_ARGS
                        Transcoding args for `ffmpeg -i <src> <args> <dst>`
  --rtsp-transport {tcp,udp,http,udp_multicast}
                        RTSP transport protocol used by stream
  --username USERNAME, -u USERNAME
                        Camera username
  --password PASSWORD, -p PASSWORD
                        Camera password
  --stream {main,sub}, -m {main,sub}
                        Stream profile to use for the higher quality stream (default: main)
  --substream {main,sub}, -s {main,sub}
                        Stream profile to use for the lower quality stream (default: sub)
```

## RLC-410-5MP

- [x] Supports full time recording
- [x] Supports motion events
- [ ] Supports smart detection
- Notes:
  - When using 'sub' substream, set `tick_rate=30000/1001` since the stream is limited to a max of `15fps`

```sh
unifi-camera-proxy --mac '{unique MAC}' -H {NVR IP} -i {camera IP} -c /client.pem -t {Adoption token} \
    reolink \
    -u {username} \
    -p {password} \
    -s "main" \
    --ffmpeg-args='-c:v copy -bsf:v "h264_metadata=tick_rate=60000/1001" -ar 32000 -ac 1 -codec:a aac -b:a 32k'
```

For common arguments shared by all camera types, see [Common Arguments](common).
