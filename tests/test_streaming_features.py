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

    def test_gop_matches_fps_for_fast_hls_start(self):
        # 1s GOP (-g == fps) so HLS emits its first segment within go2rtc's
        # ~5s session keepalive instead of waiting on a 2s keyframe interval.
        tiles = [{"url": "rtsp://a/s", "x": 0, "y": 0, "w": 1920, "h": 1080}]
        assert "-g 10 " in build_mosaic_exec(tiles, 1920, 1080, 10)


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


class TestWriteConfig:
    def _read_yaml(self, mgr, config, tmp_path):
        import yaml

        mgr.data_dir = tmp_path
        path = mgr._write_config(config)
        with open(path) as f:
            return yaml.safe_load(f)

    def test_webrtc_candidate_written_when_set(self, tmp_path):
        mgr = object.__new__(Go2rtcManager)
        doc = self._read_yaml(
            mgr,
            {"global": {"webrtc_candidate": "cam.example.com:8555"}, "cameras": []},
            tmp_path,
        )
        assert doc["webrtc"]["listen"] == ":8555"
        assert doc["webrtc"]["candidates"] == ["cam.example.com:8555"]

    def test_no_candidates_key_when_unset(self, tmp_path):
        mgr = object.__new__(Go2rtcManager)
        doc = self._read_yaml(mgr, {"global": {}, "cameras": []}, tmp_path)
        assert doc["webrtc"]["listen"] == ":8555"
        assert "candidates" not in doc["webrtc"]


class TestMosaicValidation:
    """Validation must catch the silent-fail mosaic configs that used to
    produce blank compositions downstream in go2rtc / the mosaic process."""

    @staticmethod
    def _validate(data, manager=None, editing_id=None):
        from unifi.web.server import _validate_camera_config

        return _validate_camera_config(data, manager, editing_id)

    def _base(self, **overrides):
        cfg = {"name": "Wall", "type": "mosaic", "mac": "AA:BB:CC:DD:EE:FF"}
        cfg.update(overrides)
        return cfg

    def test_rejects_missing_tiles(self):
        errors = self._validate(self._base())
        assert any("at least one tile" in e for e in errors)

    def test_rejects_empty_tiles(self):
        errors = self._validate(self._base(tiles=[]))
        assert any("at least one tile" in e for e in errors)

    def test_rejects_zero_size_tile(self):
        errors = self._validate(
            self._base(tiles=[{"url": "rtsp://x", "x": 0, "y": 0, "w": 0, "h": 480}])
        )
        assert any("Tile 1" in e and "width and height" in e for e in errors)

    def test_rejects_tile_without_source_or_url(self):
        errors = self._validate(
            self._base(tiles=[{"x": 0, "y": 0, "w": 100, "h": 100}])
        )
        assert any("Tile 1" in e and "source camera or RTSP url" in e for e in errors)

    def test_rejects_tile_with_unknown_source(self):
        class FakeMgr:
            config = {"cameras": [{"id": "abc123"}]}

        errors = self._validate(
            self._base(tiles=[{"source": "ghost", "x": 0, "y": 0, "w": 100, "h": 100}]),
            manager=FakeMgr(),
        )
        assert any(
            "Tile 1" in e and "ghost" in e and "does not exist" in e for e in errors
        )

    def test_accepts_valid_mosaic(self):
        class FakeMgr:
            config = {"cameras": [{"id": "abc123"}]}

        errors = self._validate(
            self._base(
                tiles=[
                    {"source": "abc123", "x": 0, "y": 0, "w": 960, "h": 540},
                    {"url": "rtsp://h/s", "x": 960, "y": 0, "w": 960, "h": 540},
                ]
            ),
            manager=FakeMgr(),
        )
        assert errors == []

    def test_non_mosaic_unaffected(self):
        errors = self._validate(
            {"name": "C", "type": "rtsp", "mac": "AA:BB:CC:DD:EE:FF"}
        )
        # No tile fields required for non-mosaic cameras.
        assert errors == []


class TestEnsureStartedAfterSave:
    """ensure_started_after_save must auto-start tile-source dependencies,
    then await the go2rtc restart, then start the mosaic process — in order."""

    def test_orchestrates_dependency_start_then_apply_then_mosaic(self):
        import asyncio

        from unifi.web.camera_manager import CameraInstance, CameraManager

        calls: list[str] = []

        async def fake_apply_config(_cfg):
            calls.append("apply_config")

        async def fake_start_camera(cam_id):
            calls.append(f"start:{cam_id}")
            mgr.instances[cam_id].status = "running"

        mgr = object.__new__(CameraManager)
        mgr.config = {
            "global": {},
            "cameras": [
                {"id": "src1", "type": "rtsp", "enabled": True},
                {
                    "id": "wall1",
                    "type": "mosaic",
                    "enabled": True,
                    "tiles": [{"source": "src1", "x": 0, "y": 0, "w": 960, "h": 540}],
                },
            ],
        }
        mgr.instances = {
            "src1": CameraInstance(id="src1", config=mgr.config["cameras"][0]),
            "wall1": CameraInstance(id="wall1", config=mgr.config["cameras"][1]),
        }

        class FakeGo2rtc:
            apply_config = staticmethod(fake_apply_config)

        mgr.go2rtc = FakeGo2rtc()
        mgr.start_camera = fake_start_camera  # type: ignore[assignment]

        async def fake_warm_up(cam_id, _instance):
            calls.append(f"warm:{cam_id}")

        mgr._warm_up_mosaic_stream = fake_warm_up  # type: ignore[assignment]

        asyncio.run(mgr.ensure_started_after_save("wall1"))

        # Tile source must come up FIRST, then go2rtc applies (so its exec has
        # an RTSP input ready), THEN the mosaic stream is warmed up (kicks the
        # exec ffmpeg + surfaces tile errors), THEN the mosaic process spawns.
        assert calls == ["start:src1", "apply_config", "warm:wall1", "start:wall1"]

    def test_noop_for_non_mosaic(self):
        import asyncio

        from unifi.web.camera_manager import CameraInstance, CameraManager

        mgr = object.__new__(CameraManager)
        mgr.config = {"cameras": [{"id": "c1", "type": "rtsp"}]}
        mgr.instances = {"c1": CameraInstance(id="c1", config=mgr.config["cameras"][0])}

        # Should return without touching go2rtc or start_camera.
        asyncio.run(mgr.ensure_started_after_save("c1"))


class TestMosaicProbe:
    """The 15s ffprobe of the go2rtc exec source was holding init_adoption open
    long enough for UniFi Protect to drop the WebSocket. The mosaic knows its
    output dimensions from its config, so it must short-circuit the probe."""

    def test_returns_configured_output_dims_without_ffprobe(self):
        import argparse

        from unifi.cams.mosaic import MosaicCam

        cam = object.__new__(MosaicCam)
        cam.args = argparse.Namespace(output_width=1920, output_height=1080)
        # Source URL is irrelevant — the override never calls ffprobe.
        assert cam.probe_video_resolution("video1", "rtsp://does-not-exist/x") == (
            1920,
            1080,
        )


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
