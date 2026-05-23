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


class TestStartMosaicWithDependencies:
    """When the user clicks Start on a mosaic, the manager must auto-start
    its tile-source dependencies, await the go2rtc restart, warm the exec
    stream, then start the mosaic process — in that order."""

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

        asyncio.run(mgr.start_mosaic_with_dependencies("wall1"))

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
        asyncio.run(mgr.start_mosaic_with_dependencies("c1"))


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


class TestWebSocketCloseLogging:
    """When Protect closes the adoption WS, our send/recv catches must log
    the close code + reason so the next failure is self-describing.
    v1.5.2 only caught ConnectionClosedError — clean closes (ConnectionClosedOK,
    e.g. code 1000) crashed the process. v1.6.1 widens the catch and pulls
    .rcvd.code + .rcvd.reason into the log line."""

    def test_close_detail_renders_code_and_reason(self):
        from unifi.cams.base import _close_detail

        class FakeFrame:
            code = 1011
            reason = "policy violation"

        class FakeExc:
            rcvd = FakeFrame()

        detail = _close_detail(FakeExc())
        assert "code=1011" in detail
        assert "policy violation" in detail
        assert detail.startswith(" (") and detail.endswith(")")

    def test_close_detail_is_empty_without_rcvd(self):
        from unifi.cams.base import _close_detail

        class FakeExc:
            rcvd = None

        assert _close_detail(FakeExc()) == ""

    def test_send_catches_both_closed_error_and_ok(self):
        """Both ConnectionClosedError and ConnectionClosedOK reach the same
        RetryableError path; the bare 'except ConnectionClosedError' from
        v1.5.2 would have let an OK close crash the process."""
        import asyncio
        import logging

        import websockets.exceptions

        from unifi.cams.base import UnifiCamBase
        from unifi.cams.mosaic import MosaicCam  # concrete subclass
        from unifi.core import RetryableError

        for exc_cls in (
            websockets.exceptions.ConnectionClosedError,
            websockets.exceptions.ConnectionClosedOK,
        ):

            class FakeWS:
                async def send(self, _payload):
                    raise exc_cls(None, None)

            cam = object.__new__(MosaicCam)
            cam.logger = logging.getLogger("test")
            cam._session = FakeWS()

            class FakeArgs:
                host = "unifi-protect"

            cam.args = FakeArgs()

            async def run():
                await UnifiCamBase.send(cam, {"messageId": 1, "functionName": "x"})

            try:
                asyncio.run(run())
            except RetryableError:
                pass
            else:
                raise AssertionError(
                    f"send() must raise RetryableError for {exc_cls.__name__}"
                )
            assert cam._session is None


class TestAdoptionStuckDetection:
    """v1.5.2 hid Protect's WS rejection behind a silent retry loop. The
    manager now tracks adoption state from the camera process's log lines and
    surfaces 'stuck' via error_message so the UI doesn't lie about health."""

    def test_observe_adoption_signal_marks_adopting(self):
        from unifi.web.camera_manager import CameraInstance, CameraManager

        mgr = object.__new__(CameraManager)
        inst = CameraInstance(id="c1", config={})
        mgr._observe_adoption_signal(inst, "Adopting with mac [AABBCC112233]")
        assert inst.adoption_state == "adopting"
        assert inst.adoption_retry_count == 0
        assert inst.adoption_started_at is not None

    def test_observe_adoption_signal_counts_close_events(self):
        from unifi.web.camera_manager import CameraInstance, CameraManager

        mgr = object.__new__(CameraManager)
        inst = CameraInstance(id="c1", config={})
        mgr._observe_adoption_signal(inst, "Adopting with mac [X]")
        mgr._observe_adoption_signal(
            inst, "Connection to unifi-protect was closed while sending."
        )
        mgr._observe_adoption_signal(
            inst,
            "Connection to unifi-protect was closed while sending (code=1011).",
        )
        assert inst.adoption_retry_count == 2

    def test_observe_adoption_signal_resets_on_new_adoption(self):
        from unifi.web.camera_manager import CameraInstance, CameraManager

        mgr = object.__new__(CameraManager)
        inst = CameraInstance(id="c1", config={})
        mgr._observe_adoption_signal(inst, "Adopting with mac [X]")
        mgr._observe_adoption_signal(inst, "Connection to x was closed.")
        # Simulate a state where this attempt finished; the next adoption
        # starts fresh.
        inst.adoption_state = "unknown"
        mgr._observe_adoption_signal(inst, "Adopting with mac [X]")
        assert inst.adoption_retry_count == 0

    def test_detect_adoption_stuck_sets_error_message(self):
        import asyncio

        from unifi.web.camera_manager import CameraInstance, CameraManager

        mgr = object.__new__(CameraManager)
        inst = CameraInstance(id="c1", config={})
        inst.status = "running"
        inst.adoption_state = "adopting"
        inst.adoption_retry_count = 5

        # Drive the detector with a near-zero delay + a one-shot loop guard.
        original_delay = CameraManager._ADOPTION_STUCK_DELAY
        CameraManager._ADOPTION_STUCK_DELAY = 0.01

        async def run_once():
            task = asyncio.create_task(mgr._detect_adoption_stuck(inst))
            # Let the detector run its first iteration, then cancel.
            await asyncio.sleep(0.05)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        try:
            asyncio.run(run_once())
            assert inst.error_message == CameraManager._ADOPTION_STUCK_MESSAGE
        finally:
            CameraManager._ADOPTION_STUCK_DELAY = original_delay

    def test_detect_adoption_stuck_quiet_when_healthy(self):
        import asyncio

        from unifi.web.camera_manager import CameraInstance, CameraManager

        mgr = object.__new__(CameraManager)
        inst = CameraInstance(id="c1", config={})
        inst.status = "running"
        inst.adoption_state = "adopted"  # success path
        inst.adoption_retry_count = 0

        original_delay = CameraManager._ADOPTION_STUCK_DELAY
        CameraManager._ADOPTION_STUCK_DELAY = 0.01

        async def run_once():
            task = asyncio.create_task(mgr._detect_adoption_stuck(inst))
            await asyncio.sleep(0.05)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        try:
            asyncio.run(run_once())
            assert inst.error_message is None
        finally:
            CameraManager._ADOPTION_STUCK_DELAY = original_delay


class TestMosaicWarmupRetry:
    """v1.6.2: the warm-up ffprobe retries once on transient ``Invalid data``
    and dumps go2rtc's /api/streams JSON on final failure. Mock the ffprobe
    helper directly — spawning real ffprobe is out of scope."""

    def test_retries_on_invalid_data_then_succeeds(self):
        import asyncio

        from unifi.web.camera_manager import CameraInstance, CameraManager

        mgr = object.__new__(CameraManager)
        inst = CameraInstance(id="m1", config={"type": "mosaic"})
        inst.error_message = "Composition source not producing yet — stale"

        calls = []

        async def fake_ffprobe(source):
            calls.append(source)
            if len(calls) == 1:
                return ("Invalid data found when processing input", 1)
            return ("", 0)

        mgr._ffprobe_mosaic_once = fake_ffprobe  # type: ignore[assignment]

        async def fake_fetch_state(_id):
            return ""

        mgr._fetch_go2rtc_stream_state = fake_fetch_state  # type: ignore[assignment]

        # Skip the 2s real-sleep between attempts.
        original_delay = CameraManager._WARM_UP_RETRY_DELAY
        CameraManager._WARM_UP_RETRY_DELAY = 0.01
        try:
            asyncio.run(mgr._warm_up_mosaic_stream("m1", inst))
        finally:
            CameraManager._WARM_UP_RETRY_DELAY = original_delay

        assert len(calls) == 2, "ffprobe should be retried once on Invalid data"
        # Prior composition-source error must be cleared on a successful retry.
        assert inst.error_message is None

    def test_retries_on_timeout_then_persists_failure(self):
        import asyncio

        from unifi.web.camera_manager import CameraInstance, CameraManager

        mgr = object.__new__(CameraManager)
        inst = CameraInstance(id="m1", config={"type": "mosaic"})
        calls = []

        async def fake_ffprobe(source):
            calls.append(source)
            # Timeout = (text, None)
            return ("", None)

        async def fake_fetch_state(camera_id):
            return f'{{"{camera_id}":{{"producers":[]}}}}'

        mgr._ffprobe_mosaic_once = fake_ffprobe  # type: ignore[assignment]
        mgr._fetch_go2rtc_stream_state = fake_fetch_state  # type: ignore[assignment]

        original_delay = CameraManager._WARM_UP_RETRY_DELAY
        CameraManager._WARM_UP_RETRY_DELAY = 0.01
        try:
            asyncio.run(mgr._warm_up_mosaic_stream("m1", inst))
        finally:
            CameraManager._WARM_UP_RETRY_DELAY = original_delay

        assert len(calls) == 2, "timeout path should still retry once"
        assert inst.error_message is not None
        assert "Composition source not producing" in inst.error_message


class TestWebSocketHeaders:
    """v1.6.3 tried adding ``camera-model: <sysid>`` to the WS handshake on
    the hypothesis that Protect's strict adoption needed it — and that
    broke previously-working tile cameras with the same ``code=4012`` close.
    v1.6.4 reverted. These tests are now a regression guard: re-introducing
    ``camera-model`` without explicit reasoning has to update them
    deliberately."""

    def test_camera_model_header_not_sent_even_when_sysid_set(self):
        from unifi.core import Core

        core = object.__new__(Core)
        core.mac = "AABBCC112233"
        core.sysid = "0xa572"  # UVC G4 Bullet — still computed; just not sent
        headers = Core._build_ws_headers(core)
        assert headers == {"camera-mac": "AABBCC112233"}, (
            "WS handshake must send camera-mac only — adding camera-model "
            "in v1.6.3 broke tile-camera adoption with code=4012."
        )

    def test_camera_mac_present_when_sysid_missing(self):
        from unifi.core import Core

        core = object.__new__(Core)
        core.mac = "AABBCC112233"
        core.sysid = None
        headers = Core._build_ws_headers(core)
        assert headers == {"camera-mac": "AABBCC112233"}


class TestMosaicSidecarHandler:
    """v1.6.3: CameraManager + Go2rtc log records that reference a mosaic
    camera id get mirrored into that camera's log_buffer so the per-camera
    LogViewer shows warm-up + go2rtc lines alongside camera-process lines."""

    def test_mirrors_log_for_matching_mosaic_id(self):
        import logging

        from unifi.web.camera_manager import (
            CameraInstance,
            CameraManager,
            _MosaicSidecarHandler,
        )

        mgr = object.__new__(CameraManager)
        mgr.instances = {
            "wall1": CameraInstance(id="wall1", config={"type": "mosaic"}),
            "rtsp1": CameraInstance(id="rtsp1", config={"type": "rtsp"}),
        }
        handler = _MosaicSidecarHandler(mgr)
        record = logging.LogRecord(
            name="Go2rtc",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="[go2rtc] stream wall1: exec ffmpeg failed",
            args=(),
            exc_info=None,
        )
        handler.emit(record)
        assert len(mgr.instances["wall1"].log_buffer) == 1
        entry = list(mgr.instances["wall1"].log_buffer)[0]
        assert entry["logger"] == "Go2rtc"
        assert "wall1" in entry["message"]
        # Non-mosaic instances are never mirrored.
        assert len(mgr.instances["rtsp1"].log_buffer) == 0

    def test_skips_records_with_no_matching_mosaic(self):
        import logging

        from unifi.web.camera_manager import (
            CameraInstance,
            CameraManager,
            _MosaicSidecarHandler,
        )

        mgr = object.__new__(CameraManager)
        mgr.instances = {
            "wall1": CameraInstance(id="wall1", config={"type": "mosaic"}),
        }
        handler = _MosaicSidecarHandler(mgr)
        record = logging.LogRecord(
            name="CameraManager",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="some unrelated message",
            args=(),
            exc_info=None,
        )
        handler.emit(record)
        assert len(mgr.instances["wall1"].log_buffer) == 0


class TestFirmwareVersionParse:
    """v1.6.5: process_upgrade used to compare each byte of the firmware
    blob against the ``bytes`` literal ``b"\\x00"`` instead of the int 0,
    so the null-terminator check never tripped and every byte (including
    binary noise) got concatenated into ``self.args.fw_version``. Once that
    garbage was persisted via a UI save into config.yaml, every subsequent
    adoption hello carried an invalid firmware string and Protect closed
    the WS with code 4012."""

    def test_stops_at_null_byte_and_returns_ascii(self):
        from unifi.cams.base import _parse_firmware_version

        # 4-byte preamble + "UVC.S2L.v4" + NUL + garbage.
        blob = b"\x00\x00\x00\x00" + b"UVC.S2L.v4" + b"\x00" + b"\x80\xff\x00"
        # Pad to required 54-byte length.
        blob = blob + b"\x00" * (54 - len(blob))
        assert _parse_firmware_version(blob) == "UVC.S2L.v4"

    def test_drops_non_printable_bytes(self):
        from unifi.cams.base import _parse_firmware_version

        # 4-byte preamble + non-printable bytes mixed with ASCII, no NUL.
        blob = b"\x00\x00\x00\x00" + b"U\xffV\x01C\x80.\x80S\x002\x00" + b"\x00" * 50
        # \xff, \x01, \x80 are non-printable and stripped. NUL terminates.
        result = _parse_firmware_version(blob[:54])
        assert result == "UVC.S"  # the second NUL after S ends parsing

    def test_returns_empty_when_first_byte_is_null(self):
        from unifi.cams.base import _parse_firmware_version

        blob = b"\x00\x00\x00\x00" + b"\x00" * 50
        assert _parse_firmware_version(blob) == ""

    def test_handles_short_blob(self):
        from unifi.cams.base import _parse_firmware_version

        assert _parse_firmware_version(b"") == ""
        assert _parse_firmware_version(b"\x00\x00\x00") == ""


class TestFirmwareVersionSanitization:
    """v1.6.5: ``load_config`` drops corrupted ``fw_version`` values from
    each camera so the subprocess falls back to the default UVC string
    rather than poisoning the next adoption hello with garbage."""

    def test_drops_garbage_value(self, tmp_path):
        import yaml

        from unifi.web.config import load_config

        config_file = tmp_path / "config.yaml"
        with open(config_file, "w") as f:
            yaml.dump(
                {
                    "global": {},
                    "cameras": [
                        {
                            "id": "abc123",
                            "name": "Garage",
                            "mac": "AABBCC112233",
                            "type": "rtsp",
                            "fw_version": (
                                "646b7432306f4ae2617ff17c769c94f3260ce87ac5bd05b2ba"
                            ),
                        }
                    ],
                },
                f,
            )
        loaded = load_config(str(config_file))
        cam = loaded["cameras"][0]
        assert "fw_version" not in cam, (
            "Garbage fw_version must be dropped so the subprocess uses "
            "main.py's default (Protect close 4012 fix)."
        )

    def test_keeps_valid_uvc_value(self, tmp_path):
        import yaml

        from unifi.web.config import load_config

        config_file = tmp_path / "config.yaml"
        good = "UVC.S2L.v4.23.8.67.0eba6e3.200526.1046"
        with open(config_file, "w") as f:
            yaml.dump(
                {
                    "global": {},
                    "cameras": [
                        {
                            "id": "abc123",
                            "name": "Garage",
                            "mac": "AABBCC112233",
                            "type": "rtsp",
                            "fw_version": good,
                        }
                    ],
                },
                f,
            )
        loaded = load_config(str(config_file))
        assert loaded["cameras"][0]["fw_version"] == good


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
