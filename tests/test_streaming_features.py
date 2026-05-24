"""Tests for go2rtc live-preview, Live Views, firmware parsing, talkback."""

from unifi.web.config import config_to_args, get_camera_type_schemas
from unifi.web.go2rtc import Go2rtcManager, resolve_stream_source


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


class TestBuildStreams:
    def test_one_pull_source_per_camera(self):
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
            ],
        }
        streams = mgr._build_streams(config)
        # Medium tier preferred to save bandwidth on the live preview.
        assert streams["cam001"] == "rtsp://h/lo"


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


class TestCameraConfigValidation:
    """Validation at the form-save boundary catches bad camera payloads
    before they reach config.yaml or the subprocess."""

    @staticmethod
    def _validate(data, manager=None, editing_id=None):
        from unifi.web.server import _validate_camera_config

        return _validate_camera_config(data, manager, editing_id)

    def test_accepts_minimal_valid(self):
        errors = self._validate(
            {"name": "C", "type": "rtsp", "mac": "AA:BB:CC:DD:EE:FF"}
        )
        assert errors == []

    def test_rejects_missing_name(self):
        errors = self._validate({"type": "rtsp", "mac": "AA:BB:CC:DD:EE:FF"})
        assert any("'name'" in e for e in errors)

    def test_rejects_unknown_type(self):
        errors = self._validate(
            {"name": "C", "type": "mosaic", "mac": "AA:BB:CC:DD:EE:FF"}
        )
        # GridFusion went away in v1.7.0; mosaic is no longer a valid type.
        assert any("'type' must be one of" in e for e in errors)

    def test_accepts_valid_fw_version(self):
        errors = self._validate(
            {
                "name": "C",
                "type": "rtsp",
                "mac": "AA:BB:CC:DD:EE:FF",
                "fw_version": "UVC.S2L.v4.23.8.67.0eba6e3.200526.1046",
            }
        )
        assert errors == []

    def test_rejects_garbage_fw_version(self):
        errors = self._validate(
            {
                "name": "C",
                "type": "rtsp",
                "mac": "AA:BB:CC:DD:EE:FF",
                "fw_version": "646b7432306f4ae2617ff17c769c94f3260ce87ac5bd05b2ba",
            }
        )
        # v1.7.0 moves the v1.6.5 load-time self-heal to a form-save check;
        # the regex blocks anything that doesn't look like a UVC fw string.
        assert any("UVC firmware string" in e for e in errors)


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
        from unifi.cams.rtsp import RTSPCam  # concrete subclass
        from unifi.core import RetryableError

        for exc_cls in (
            websockets.exceptions.ConnectionClosedError,
            websockets.exceptions.ConnectionClosedOK,
        ):

            class FakeWS:
                async def send(self, _payload):
                    raise exc_cls(None, None)

            cam = object.__new__(RTSPCam)
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


class TestWebSocketHeaders:
    """v1.7.1: WS handshake sends PascalCase ``Camera-Mac`` (normalized) and
    ``Camera-Model`` (sysid hex), matching the redalert11/unifi-cam-proxy
    fork's working wire format. Without ``Camera-Model`` Protect's UI
    labels every camera generically as "Camera"; the failed v1.6.3 attempt
    sent lowercase ``camera-model`` and Protect's case-sensitive header
    parser rejected the connection with ``code=4012``."""

    def test_pascal_case_headers_and_normalized_mac(self):
        from unifi.core import Core

        core = object.__new__(Core)
        core.mac = "AA:BB:CC:11:22:33"
        core.sysid = "0xa572"  # UVC G4 Bullet
        headers = Core._build_ws_headers(core)
        assert headers == {
            "Camera-Mac": "aabbcc112233",
            "Camera-Model": "0xa572",
        }, "Headers must be PascalCase; MAC lowercased + colons stripped"

    def test_mac_already_normalized_passes_through(self):
        from unifi.core import Core

        core = object.__new__(Core)
        core.mac = "AABBCC112233"
        core.sysid = "0xa572"
        headers = Core._build_ws_headers(core)
        assert headers["Camera-Mac"] == "aabbcc112233"

    def test_camera_model_omitted_when_sysid_missing(self):
        from unifi.core import Core

        core = object.__new__(Core)
        core.mac = "aabbcc112233"
        core.sysid = None
        headers = Core._build_ws_headers(core)
        assert headers == {"Camera-Mac": "aabbcc112233"}, (
            "No sysid (e.g. unit tests without main.py's lookup) → omit "
            "Camera-Model entirely rather than send an empty string."
        )


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


class TestLiveViewValidation:
    """v1.7.0: Live Views are saved layouts of existing cameras. Validation
    runs at the form-save boundary; bad payloads never reach config.yaml."""

    @staticmethod
    def _validate(data, cameras=None):
        from unifi.web.live_views import validate_live_view

        return validate_live_view(data, cameras or [])

    def _good(self, **overrides):
        cfg = {
            "name": "Wall",
            "canvas": {"w": 1920, "h": 1080},
            "tiles": [{"camera_id": "c1", "x": 0, "y": 0, "w": 960, "h": 540}],
        }
        cfg.update(overrides)
        return cfg

    def test_accepts_minimal_valid(self):
        errors = self._validate(self._good(), cameras=[{"id": "c1"}])
        assert errors == []

    def test_rejects_missing_name(self):
        errors = self._validate({**self._good(), "name": ""}, cameras=[{"id": "c1"}])
        assert any("'name'" in e for e in errors)

    def test_rejects_unknown_camera(self):
        errors = self._validate(self._good(), cameras=[{"id": "other"}])
        assert any("camera_id" in e and "c1" in e for e in errors)

    def test_rejects_zero_size_tile(self):
        errors = self._validate(
            self._good(tiles=[{"camera_id": "c1", "x": 0, "y": 0, "w": 0, "h": 540}]),
            cameras=[{"id": "c1"}],
        )
        assert any("w and h must be positive" in e for e in errors)

    def test_rejects_tile_outside_canvas(self):
        errors = self._validate(
            self._good(
                tiles=[{"camera_id": "c1", "x": 0, "y": 0, "w": 9999, "h": 540}]
            ),
            cameras=[{"id": "c1"}],
        )
        assert any("outside" in e for e in errors)

    def test_rejects_zero_canvas(self):
        errors = self._validate(
            {**self._good(), "canvas": {"w": 0, "h": 0}}, cameras=[{"id": "c1"}]
        )
        assert any("canvas.w" in e for e in errors)


class TestKioskTokenAuth:
    """The auth middleware lets ``/live/<id>`` and ``/api/live-views/<id>``
    through when ``?token=`` matches the view's stored kiosk_token, and
    extends the bypass to ``/go2rtc/*`` for HLS-playing kiosks.
    """

    def _request(self, path, query=""):
        # Minimal fake request that exposes the bits auth_middleware reads.
        from urllib.parse import urlsplit

        from yarl import URL

        rel = URL.build(path=path, query_string=query)

        class FakeReq:
            def __init__(self):
                self.path = path
                self.rel_url = rel
                self.headers = {}

            @property
            def scheme(self):
                return "https"

            @property
            def host(self):
                return "example.com"

        # urlsplit just to silence unused-import noise.
        urlsplit("https://example.com" + path)
        return FakeReq()

    def _manager(self, kiosk_token=None):
        class FakeMgr:
            def __init__(self):
                self.config = {
                    "live_views": [
                        {
                            "id": "abc",
                            "kiosk_token": kiosk_token,
                            "tiles": [],
                        }
                    ]
                }

            def get_live_view(self, view_id):
                for v in self.config["live_views"]:
                    if v["id"] == view_id:
                        return v
                return None

        return FakeMgr()

    def test_matches_when_token_correct(self):
        from unifi.web.server import _kiosk_token_matches

        mgr = self._manager(kiosk_token="t0p_s3cret")
        req = self._request("/api/live-views/abc", "token=t0p_s3cret")
        assert _kiosk_token_matches(mgr, req)

    def test_rejects_wrong_token(self):
        from unifi.web.server import _kiosk_token_matches

        mgr = self._manager(kiosk_token="t0p_s3cret")
        req = self._request("/api/live-views/abc", "token=wrong")
        assert not _kiosk_token_matches(mgr, req)

    def test_rejects_when_view_has_no_kiosk_token(self):
        from unifi.web.server import _kiosk_token_matches

        mgr = self._manager(kiosk_token=None)
        req = self._request("/api/live-views/abc", "token=anything")
        assert not _kiosk_token_matches(mgr, req)

    def test_any_kiosk_token_for_go2rtc(self):
        from unifi.web.server import _any_kiosk_token_matches

        mgr = self._manager(kiosk_token="grant_me")
        assert _any_kiosk_token_matches(mgr, "grant_me")
        assert not _any_kiosk_token_matches(mgr, "different")
        assert not _any_kiosk_token_matches(mgr, "")


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
