"""Tests for the go2rtc live-preview, mosaic composer, and talkback features."""

from unifi.web.config import config_to_args, get_camera_type_schemas
from unifi.web.go2rtc import (
    RTSP_BASE,
    Go2rtcManager,
    build_mosaic_exec,
    resolve_mosaic_tiles,
    resolve_stream_source,
)


class TestResolveStreamSource:
    def test_rtsp_prefers_video2_with_creds(self):
        src = resolve_stream_source(
            {"rtsp_username": "u", "rtsp_password": "p"},
            {"type": "rtsp", "video1": "rtsp://h/hi", "video2": "rtsp://h/lo"},
        )
        assert src == "rtsp://u:p@h/lo"

    def test_rtsp_falls_back_to_video1(self):
        src = resolve_stream_source({}, {"type": "rtsp", "video1": "rtsp://h/hi"})
        assert src == "rtsp://h/hi"

    def test_frigate_uses_video_source(self):
        src = resolve_stream_source({}, {"type": "frigate", "video1": "rtsp://h/main"})
        assert src == "rtsp://h/main"

    def test_tapo_appends_substream(self):
        src = resolve_stream_source({}, {"type": "tapo", "rtsp": "rtsp://h:554"})
        assert src == "rtsp://h:554/stream2"

    def test_mosaic_points_at_own_go2rtc_path(self):
        src = resolve_stream_source({}, {"type": "mosaic", "id": "abc123"})
        assert src == f"{RTSP_BASE}/abc123"

    def test_reolink_builds_vendor_url(self):
        src = resolve_stream_source(
            {},
            {
                "type": "reolink",
                "ip": "10.0.0.5",
                "username": "admin",
                "password": "pw",
                "channel": 0,
                "substream": "sub",
            },
        )
        assert src == "rtsp://admin:pw@10.0.0.5:554//h264Preview_01_sub"

    def test_missing_source_returns_none(self):
        assert resolve_stream_source({}, {"type": "rtsp"}) is None


class TestResolveMosaicTiles:
    def test_source_pulls_go2rtc_and_url_gets_creds(self):
        tiles = resolve_mosaic_tiles(
            {"rtsp_username": "u", "rtsp_password": "p"},
            {
                "type": "mosaic",
                "tiles": [
                    {"source": "cam002", "x": 0, "y": 0, "w": 960, "h": 1080},
                    {"url": "rtsp://cam3/s", "x": 960, "y": 0, "w": 960, "h": 1080},
                ],
            },
        )
        assert tiles[0]["url"] == f"{RTSP_BASE}/cam002"
        assert tiles[0]["x"] == 0 and tiles[0]["w"] == 960
        assert tiles[1]["url"] == "rtsp://u:p@cam3/s"
        assert tiles[1]["x"] == 960

    def test_zero_size_tiles_dropped(self):
        tiles = resolve_mosaic_tiles(
            {},
            {
                "type": "mosaic",
                "tiles": [
                    {"source": "a", "x": 0, "y": 0, "w": 0, "h": 100},
                    {"source": "b", "x": 0, "y": 0, "w": 100, "h": 100},
                ],
            },
        )
        assert len(tiles) == 1
        assert tiles[0]["url"] == f"{RTSP_BASE}/b"

    def test_legacy_input_urls_uniform_grid(self):
        tiles = resolve_mosaic_tiles(
            {},
            {
                "type": "mosaic",
                "input_urls": ["rtsp://a/s", "rtsp://b/s", "rtsp://c/s"],
                "grid_cols": 2,
                "output_width": 1920,
                "output_height": 1080,
            },
        )
        assert len(tiles) == 3
        assert tiles[0] == {"url": "rtsp://a/s", "x": 0, "y": 0, "w": 960, "h": 540}
        assert tiles[2] == {"url": "rtsp://c/s", "x": 0, "y": 540, "w": 960, "h": 540}


class TestBuildMosaicExec:
    def test_exec_overlay_chain(self):
        tiles = [
            {"url": "rtsp://a/s", "x": 0, "y": 0, "w": 960, "h": 1080},
            {"url": "rtsp://b/s", "x": 960, "y": 0, "w": 960, "h": 540},
        ]
        src = build_mosaic_exec(tiles, 1920, 1080, 10)
        assert src.startswith("exec:ffmpeg ")
        assert "color=c=black:s=1920x1080:r=10[bg]" in src
        assert "[0:v]scale=960:1080,setsar=1[v0]" in src
        assert "[bg][v0]overlay=0:0[t0]" in src
        assert "[t0][v1]overlay=960:0[t1]" in src
        assert '-map "[t1]"' in src
        # go2rtc substitutes {output}; we publish RTSP to it. No uniform xstack.
        assert "-f rtsp {output}" in src
        assert "xstack" not in src
        assert src.count("-i ") == 2


class TestBuildStreams:
    def test_regular_pull_and_mosaic_exec(self):
        mgr = object.__new__(Go2rtcManager)
        config = {
            "global": {},
            "cameras": [
                {
                    "id": "cam001",
                    "type": "rtsp",
                    "video1": "rtsp://h/hi",
                    "video2": "rtsp://h/lo",
                },
                {
                    "id": "wall1",
                    "type": "mosaic",
                    "output_width": 1920,
                    "output_height": 1080,
                    "tiles": [{"source": "cam001", "x": 0, "y": 0, "w": 960, "h": 540}],
                },
            ],
        }
        streams = mgr._build_streams(config)
        # Regular camera = pull source (medium tier).
        assert streams["cam001"] == "rtsp://h/lo"
        # Mosaic = exec compositing source (go2rtc only accepts exec from config).
        assert streams["wall1"].startswith("exec:ffmpeg ")
        assert f"{RTSP_BASE}/cam001" in streams["wall1"]
        assert "-f rtsp {output}" in streams["wall1"]


class TestMosaicConfigToArgs:
    def test_stream_name_is_camera_id(self):
        args = config_to_args(
            {"host": "h"},
            {"id": "abc123", "type": "mosaic", "name": "Wall", "mac": "AA:BB"},
        )
        assert args[args.index("--stream-name") + 1] == "abc123"
        # Compositing is owned by go2rtc now; no --tiles passed to the process.
        assert "--tiles" not in args


class TestTalkbackSchema:
    def test_talkback_url_in_every_type_schema(self):
        schemas = get_camera_type_schemas()
        for cam_type, fields in schemas.items():
            names = {f["name"] for f in fields}
            assert "talkback-url" in names, cam_type

    def test_talkback_url_flows_to_cli(self):
        args = config_to_args(
            {"host": "h"},
            {
                "id": "x",
                "type": "rtsp",
                "name": "C",
                "mac": "M",
                "video1": "rtsp://a/s",
                "talkback_url": "rtsp://cam/back",
            },
        )
        assert args[args.index("--talkback-url") + 1] == "rtsp://cam/back"
