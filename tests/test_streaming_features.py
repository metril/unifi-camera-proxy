"""Tests for the go2rtc live-preview, mosaic composer, and talkback features."""

import argparse

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
    def _cam(self, **overrides):
        cam = object.__new__(MosaicCam)
        cam.input_urls = overrides.get(
            "input_urls", ["rtsp://a/s", "rtsp://b/s", "rtsp://c/s", "rtsp://d/s"]
        )
        cam.cols = overrides.get("cols", 2)
        cam.rows = overrides.get("rows", 2)
        cam.publish_url = "rtsp://127.0.0.1:8554/cam1"
        cam.args = argparse.Namespace(
            rtsp_transport="tcp",
            loglevel="error",
            output_width=1920,
            output_height=1080,
            tile_fps=10,
        )
        return cam

    def test_layout_places_tiles_on_grid(self):
        cmd = self._cam()._build_compose_cmd()
        # 2x2 grid, 960x540 cells.
        assert "layout=0_0|960_0|0_540|960_540" in cmd
        assert "xstack=inputs=4" in cmd
        assert "fill=black" in cmd

    def test_publishes_to_go2rtc_over_rtsp(self):
        cmd = self._cam()._build_compose_cmd()
        assert "-f rtsp -rtsp_transport tcp rtsp://127.0.0.1:8554/cam1" in cmd

    def test_one_input_per_url(self):
        cmd = self._cam()._build_compose_cmd()
        assert cmd.count("-i ") == 4


class TestMosaicConfigToArgs:
    def test_stream_name_set_to_camera_id_and_creds_injected(self):
        args = config_to_args(
            {"host": "h", "rtsp_username": "u", "rtsp_password": "p"},
            {
                "id": "abc123",
                "type": "mosaic",
                "name": "Wall",
                "mac": "AA:BB",
                "input_urls": ["rtsp://cam1/s", "rtsp://cam2/s"],
            },
        )
        assert "--stream-name" in args
        assert args[args.index("--stream-name") + 1] == "abc123"
        idx = args.index("--input-urls")
        assert args[idx + 1] == "rtsp://u:p@cam1/s"
        assert args[idx + 2] == "rtsp://u:p@cam2/s"


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
