"""Tests for the go2rtc live-preview, mosaic composer, and talkback features."""

import argparse
import json

from unifi.cams.mosaic import MosaicCam
from unifi.web.config import config_to_args, get_camera_type_schemas
from unifi.web.go2rtc import RTSP_BASE, resolve_stream_source


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


class TestMosaicComposeCommand:
    def _cam(self, tiles):
        cam = object.__new__(MosaicCam)
        cam.tiles = tiles
        cam.publish_url = "rtsp://127.0.0.1:8554/cam1"
        cam.args = argparse.Namespace(
            rtsp_transport="tcp",
            loglevel="error",
            output_width=1920,
            output_height=1080,
            tile_fps=10,
        )
        return cam

    def test_free_positioning_overlay_chain(self):
        tiles = [
            {"url": "rtsp://a/s", "x": 0, "y": 0, "w": 960, "h": 1080},
            {"url": "rtsp://b/s", "x": 960, "y": 0, "w": 960, "h": 540},
        ]
        cmd = self._cam(tiles)._build_compose_cmd()
        # Black base canvas at the output resolution.
        assert "color=c=black:s=1920x1080:r=10[bg]" in cmd
        # Each tile scaled to its own size and overlaid at its own position.
        assert "[0:v]scale=960:1080,setsar=1[v0]" in cmd
        assert "[bg][v0]overlay=0:0[t0]" in cmd
        assert "[1:v]scale=960:540,setsar=1[v1]" in cmd
        assert "[t0][v1]overlay=960:0[t1]" in cmd
        # Final composited node is mapped out; no uniform xstack.
        assert '-map "[t1]"' in cmd
        assert "xstack" not in cmd

    def test_publishes_to_go2rtc_over_rtsp(self):
        cam = self._cam([{"url": "rtsp://a/s", "x": 0, "y": 0, "w": 100, "h": 100}])
        cmd = cam._build_compose_cmd()
        assert "-f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/cam1" in cmd

    def test_one_input_per_tile(self):
        tiles = [
            {"url": "rtsp://a/s", "x": 0, "y": 0, "w": 10, "h": 10},
            {"url": "rtsp://b/s", "x": 10, "y": 0, "w": 10, "h": 10},
            {"url": "rtsp://c/s", "x": 0, "y": 10, "w": 10, "h": 10},
        ]
        cmd = self._cam(tiles)._build_compose_cmd()
        assert cmd.count("-i ") == 3


class TestMosaicLegacyShim:
    def test_input_urls_become_uniform_grid_tiles(self):
        args = argparse.Namespace(
            tiles=None,
            input_urls=["rtsp://a/s", "rtsp://b/s", "rtsp://c/s"],
            grid_cols=2,
            output_width=1920,
            output_height=1080,
        )
        tiles = MosaicCam._load_tiles(MosaicCam, args)
        # 3 urls in 2 cols -> 2 rows; cells 960x540.
        assert len(tiles) == 3
        assert tiles[0] == {"url": "rtsp://a/s", "x": 0, "y": 0, "w": 960, "h": 540}
        assert tiles[1] == {"url": "rtsp://b/s", "x": 960, "y": 0, "w": 960, "h": 540}
        assert tiles[2] == {"url": "rtsp://c/s", "x": 0, "y": 540, "w": 960, "h": 540}


class TestMosaicConfigToArgs:
    def test_tiles_resolved_to_concrete_urls_and_stream_name(self):
        args = config_to_args(
            {"host": "h", "rtsp_username": "u", "rtsp_password": "p"},
            {
                "id": "abc123",
                "type": "mosaic",
                "name": "Wall",
                "mac": "AA:BB",
                "tiles": [
                    {"source": "cam002", "x": 0, "y": 0, "w": 960, "h": 1080},
                    {"url": "rtsp://cam3/s", "x": 960, "y": 0, "w": 960, "h": 1080},
                ],
            },
        )
        assert args[args.index("--stream-name") + 1] == "abc123"
        tiles = json.loads(args[args.index("--tiles") + 1])
        # Existing-camera tile pulls from go2rtc; raw URL gets creds injected.
        assert tiles[0]["url"] == f"{RTSP_BASE}/cam002"
        assert tiles[0]["w"] == 960 and tiles[0]["x"] == 0
        assert tiles[1]["url"] == "rtsp://u:p@cam3/s"
        assert tiles[1]["x"] == 960


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
