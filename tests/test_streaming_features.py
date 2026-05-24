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


class TestGetFirmwareVersion:
    """v1.7.2: subprocess defaults its firmware string via model_db so Protect
    doesn't immediately want to upgrade a freshly adopted camera. The platform
    code (s5l, sav539gp, …) is interpolated into FW_VERSION_TEMPLATE."""

    def test_g4_bullet_uses_s5l_platform(self):
        from unifi.model_db import get_firmware_version

        fw = get_firmware_version("UVC G4 Bullet")
        assert fw.startswith("UVC.S5L.v4.69.")

    def test_g6_ptz_uses_sav539gp_platform(self):
        from unifi.model_db import get_firmware_version

        fw = get_firmware_version("UVC G6 PTZ")
        assert fw.startswith("UVC.SAV539GP.v4.69.")

    def test_g3_uses_s2l_platform(self):
        from unifi.model_db import get_firmware_version

        fw = get_firmware_version("UVC G3")
        assert fw.startswith("UVC.S2L.v4.69.")

    def test_unknown_model_falls_back_to_default_platform(self):
        from unifi.model_db import DEFAULT_PLATFORM, get_firmware_version

        fw = get_firmware_version("Definitely Not A UVC")
        assert fw.startswith(f"UVC.{DEFAULT_PLATFORM.upper()}.v4.69.")


class TestConfigToArgsFirmware:
    """v1.7.2 stops sending --fw-version when the stored value is the legacy
    pre-v1.7.2 default — that way users with old configs don't have to manually
    edit every camera to escape Protect's upgrade prompt. User overrides still
    pass through."""

    LEGACY = "UVC.S2L.v4.23.8.67.0eba6e3.200526.1046"

    def test_legacy_default_dropped(self):
        args = config_to_args(
            {"host": "h"},
            {
                "id": "c1",
                "type": "rtsp",
                "name": "C",
                "mac": "AA:BB:CC:11:22:33",
                "fw_version": self.LEGACY,
            },
        )
        assert "--fw-version" not in args

    def test_user_override_passes_through(self):
        custom = "UVC.S5L.v4.99.99.0.deadbeef.260101.0000"
        args = config_to_args(
            {"host": "h"},
            {
                "id": "c1",
                "type": "rtsp",
                "name": "C",
                "mac": "AA:BB:CC:11:22:33",
                "fw_version": custom,
            },
        )
        idx = args.index("--fw-version")
        assert args[idx + 1] == custom

    def test_missing_fw_lets_subprocess_default_take_over(self):
        args = config_to_args(
            {"host": "h"},
            {"id": "c1", "type": "rtsp", "name": "C", "mac": "AA:BB:CC:11:22:33"},
        )
        assert "--fw-version" not in args


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


class TestGetSemver:
    """v1.7.3: the adoption hello pairs ``fwVersion`` with ``semver``. Before
    v1.7.3 ``semver`` was hardcoded to ``v4.4.8`` while ``fwVersion`` reported
    the modern ``UVC.{platform}.v4.69.55.0…`` build — Protect saw the mismatch
    and shoved an UpdateFirmwareRequest at us, which the old upgrade handler
    answered by reconnecting (with the same mismatch), looping forever.
    ``get_semver`` derives the semver from the firmware template so they
    never drift."""

    def test_g4_bullet_matches_template_semver(self):
        from unifi.model_db import get_semver

        assert get_semver("UVC G4 Bullet") == "v4.69.55"

    def test_g6_ptz_matches_template_semver(self):
        from unifi.model_db import get_semver

        assert get_semver("UVC G6 PTZ") == "v4.69.55"

    def test_g3_matches_template_semver(self):
        from unifi.model_db import get_semver

        assert get_semver("UVC G3") == "v4.69.55"

    def test_g5_dome_matches_template_semver(self):
        from unifi.model_db import get_semver

        assert get_semver("UVC G5 Dome") == "v4.69.55"

    def test_ai_pro_matches_template_semver(self):
        from unifi.model_db import get_semver

        assert get_semver("UVC AI Pro") == "v4.69.55"

    def test_unknown_model_falls_back_to_template_semver(self):
        from unifi.model_db import get_semver

        assert get_semver("Definitely Not A UVC") == "v4.69.55"


class TestHelloSemverConsistency:
    """Guard against future template drift: for every model in MODEL_DB, the
    semver string we put in the hello must be a substring of the fwVersion
    string we put in the hello. If someone bumps FW_VERSION_TEMPLATE without
    syncing this test the mismatch fires here before it reaches Protect."""

    def test_semver_is_substring_of_fw_version_for_every_model(self):
        from unifi.model_db import MODEL_DB, get_firmware_version, get_semver

        for model in MODEL_DB:
            fw = get_firmware_version(model)
            sv = get_semver(model)
            assert sv in fw, f"{model}: semver {sv!r} not in fwVersion {fw!r}"


class TestUpdateFirmwareRequestHandler:
    """v1.7.4: Protect issues ``UpdateFirmwareRequest`` on adoption even when
    ``semver`` and ``fwVersion`` agree (it pushes its bundled build to newly
    identified models). v1.7.3 ACKed but did nothing else — Protect's UI hung
    on "Preparing update". v1.7.4 ports redalert11's flow: ACK, send
    FW_DOWNLOADING + FW_UPDATING status events, close WS with code 1012, and
    force reconnect. Protect treats the close-then-reconnect as a completed
    upgrade + reboot and clears the stuck status."""

    def test_process_upgrade_does_not_mutate_fw_version(self, monkeypatch):
        """The dance must not touch ``args.fw_version``; the original v1.6.5
        bug was that ``process_upgrade`` parsed garbage bytes into it."""
        import asyncio
        import logging

        import unifi.cams.base as base_module
        from unifi.cams.base import UnifiCamBase
        from unifi.cams.rtsp import RTSPCam

        monkeypatch.setattr(base_module, "_FW_UPGRADE_STEP_DELAY_S", 0)

        cam = object.__new__(RTSPCam)
        cam.logger = logging.getLogger("test")
        cam._msg_id = 0
        cam._session = None  # closing branch is skipped; sends still work

        class FakeArgs:
            fw_version = "UVC.S5L.v4.69.55.0.7f45c5b.241212.1510"

        cam.args = FakeArgs()

        async def noop_send(msg):
            return None

        cam.send = noop_send  # type: ignore[method-assign]

        async def run():
            await UnifiCamBase.process_upgrade(
                cam, {"payload": {"uri": "http://example/firmware.bin"}}
            )

        asyncio.run(run())
        assert cam.args.fw_version == "UVC.S5L.v4.69.55.0.7f45c5b.241212.1510"

    def test_dispatch_sends_ack_then_simulates_upgrade(self, monkeypatch):
        """The full dispatch path: ACK, FW_DOWNLOADING, FW_UPDATING,
        close(code=1012, reason="rebooting"), return True."""
        import asyncio
        import json
        import logging

        import unifi.cams.base as base_module
        from unifi.cams.base import UnifiCamBase
        from unifi.cams.rtsp import RTSPCam

        monkeypatch.setattr(base_module, "_FW_UPGRADE_STEP_DELAY_S", 0)

        cam = object.__new__(RTSPCam)
        cam.logger = logging.getLogger("test")
        cam._msg_id = 0

        class FakeArgs:
            fw_version = "UVC.S5L.v4.69.55.0.7f45c5b.241212.1510"
            # Lowercase + colons to exercise the .upper() in the deviceID
            # transform (v1.7.5).
            mac = "aa:bb:cc:11:22:33"

        cam.args = FakeArgs()
        sent: list[dict] = []

        async def fake_send(msg):
            sent.append(msg)

        cam.send = fake_send  # type: ignore[method-assign]

        close_calls: list[dict] = []

        class FakeWS:
            async def close(self, code=None, reason=None):
                close_calls.append({"code": code, "reason": reason})

        cam._session = FakeWS()

        request = {
            "functionName": "UpdateFirmwareRequest",
            "messageId": 42,
            "responseExpected": True,
            "payload": {"uri": "http://example/firmware.bin"},
        }

        async def run():
            return await UnifiCamBase.process(cam, json.dumps(request).encode())

        force_reconnect = asyncio.run(run())

        assert force_reconnect is True, (
            "v1.7.4: UpdateFirmwareRequest MUST force reconnect to complete "
            "the simulated reboot cycle Protect is waiting for."
        )
        assert len(sent) == 3, f"expected ACK + 2 status events, got {sent!r}"

        ack, downloading, updating = sent
        assert ack["functionName"] == "UpdateFirmwareRequest"
        assert ack["inResponseTo"] == 42
        # v1.7.5: deviceID is the idempotency key Protect uses to recognize
        # "this device already accepted this upgrade" — without it Protect
        # re-issues UpdateFirmwareRequest on every reconnect.
        assert ack["payload"] == {
            "statusCode": 0,
            "status": "ok",
            "deviceID": "AA:BB:CC:11:22:33",
        }

        assert downloading["functionName"] == "EventUpdateFirmwareStatus"
        assert downloading["payload"] == {"status": "FW_DOWNLOADING"}

        assert updating["functionName"] == "EventUpdateFirmwareStatus"
        assert updating["payload"] == {"status": "FW_UPDATING"}

        assert close_calls == [{"code": 1012, "reason": "rebooting"}], (
            "WS must close with code 1012 / reason 'rebooting' so Protect "
            "marks the upgrade complete after the reconnect."
        )


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
