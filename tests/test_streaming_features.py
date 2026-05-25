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


class TestExtractSemver:
    """``extract_semver`` is the pure-string variant of ``get_semver`` —
    callable on a runtime-mutated ``args.fw_version`` so semver follows
    the value ``process_upgrade`` bumps it to (v1.7.6)."""

    def test_pulls_xyz_out_of_modern_fw_string(self):
        from unifi.model_db import extract_semver

        assert extract_semver("UVC.S5L.v4.79.55.0.deadbeef.250101.1500") == "v4.79.55"

    def test_pulls_xyz_out_of_legacy_fw_string(self):
        from unifi.model_db import extract_semver

        assert extract_semver("UVC.S2L.v4.23.8.67.0eba6e3.200526.1046") == "v4.23.8"

    def test_falls_back_when_no_semver_present(self):
        from unifi.model_db import _FALLBACK_SEMVER, extract_semver

        assert extract_semver("garbage with no version") == _FALLBACK_SEMVER
        assert extract_semver("") == _FALLBACK_SEMVER


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

    def test_extract_semver_follows_a_runtime_bump(self):
        """After ``process_upgrade`` mutates ``args.fw_version`` to whatever
        Protect pushed, the hello reads ``extract_semver(args.fw_version)``
        — that pair must still be consistent."""
        from unifi.model_db import extract_semver

        bumped = "UVC.S5L.v4.79.55.0.deadbeef.250101.1500"
        assert extract_semver(bumped) in bumped


class TestFirmwareVersionParse:
    """``process_upgrade`` parses the version out of the upgrade binary's
    header so the post-reconnect hello reports the version Protect just
    tried to push. v1.6.5 introduced this helper to fix a bytes-vs-int
    comparison bug that concatenated raw binary noise into
    ``self.args.fw_version``. v1.7.7 added a strict UVC-shape regex
    gate: G6 firmware binaries embed their version somewhere other than
    byte 4, so the first 50 bytes can look like clean hex ASCII without
    being a UVC version string. Without the regex, that ASCII run gets
    stored in fw_version and Protect closes the next hello with code
    4012."""

    def test_accepts_valid_uvc_string(self):
        from unifi.cams.base import _parse_firmware_version

        version = b"UVC.SAV539GP.v4.79.55.0.deadbeef.250101.1500"
        blob = b"\x00\x00\x00\x00" + version + b"\x00" * (54 - 4 - len(version))
        assert len(blob) == 54
        assert _parse_firmware_version(blob) == version.decode("ascii")

    def test_rejects_g6_ptz_hex_run_regression(self):
        """v1.7.6 stored ``646b7432306f4ae2617ff17c769c94f3260ce87ac5bd05b2ba``
        as fw_version on a G6 PTZ, triggered Protect WS close 4012.
        v1.7.7's regex gate rejects this and any other non-UVC-shape
        printable-ASCII run."""
        from unifi.cams.base import _parse_firmware_version

        blob = (
            b"\x00\x00\x00\x00" + b"646b7432306f4ae2617ff17c769c94f3260ce87ac5bd05b2ba"
        )
        assert len(blob) == 54
        assert _parse_firmware_version(blob) == ""

    def test_rejects_truncated_uvc_prefix(self):
        """``UVC.S2L.v4`` (no minor.patch) is structurally close but
        not a complete version string — Protect would reject it too."""
        from unifi.cams.base import _parse_firmware_version

        blob = b"\x00\x00\x00\x00" + b"UVC.S2L.v4" + b"\x00" * (54 - 4 - 10)
        assert _parse_firmware_version(blob) == ""

    def test_stops_at_null_byte_when_shape_matches(self):
        from unifi.cams.base import _parse_firmware_version

        version_prefix = b"UVC.S2L.v4.23.8"
        # 4-byte preamble + version + NUL + junk; NUL must terminate first.
        blob = b"\x00\x00\x00\x00" + version_prefix + b"\x00" + b"junkjunk"
        blob = blob + b"\x00" * (54 - len(blob))
        assert _parse_firmware_version(blob) == version_prefix.decode("ascii")

    def test_returns_empty_when_first_byte_is_null(self):
        from unifi.cams.base import _parse_firmware_version

        blob = b"\x00\x00\x00\x00" + b"\x00" * 50
        assert _parse_firmware_version(blob) == ""

    def test_handles_short_blob(self):
        from unifi.cams.base import _parse_firmware_version

        assert _parse_firmware_version(b"") == ""
        assert _parse_firmware_version(b"\x00\x00\x00") == ""


class TestExtractUriVersion:
    """v1.7.8 + v1.8.3: Protect's UpdateFirmwareRequest URI carries the
    target firmware version — in two shapes, depending on Protect
    version. The parser tries both so we work against legacy and
    modern controllers."""

    # Protect 4.x — query-string form (v1.7.8 baseline).
    REAL_URI = (
        "https://unifi-protect:7444/internal/update?platform=sav539gp"
        "&product=uvc&updateType=firmware&version=5.2.73&mac=AABBCC5B04C3"
    )

    # Protect 5.x — clean path-segment form (v1.8.3, taken verbatim from
    # the user's repro log).
    PATH_URI = (
        "https://unifi-protect:7444/internal/update/sav539gp/uvc/firmware/"
        "5.3.89/AABBCC5B04C3"
    )

    def test_extracts_semver_from_real_uri(self):
        from unifi.cams.base import _extract_uri_version

        assert _extract_uri_version(self.REAL_URI) == "5.2.73"

    def test_extracts_semver_from_protect_5x_path_uri(self):
        from unifi.cams.base import _extract_uri_version

        assert _extract_uri_version(self.PATH_URI) == "5.3.89"

    def test_returns_empty_when_no_version_param(self):
        from unifi.cams.base import _extract_uri_version

        assert _extract_uri_version("https://h/firmware.bin") == ""
        assert _extract_uri_version("https://h/firmware.bin?platform=s5l") == ""

    def test_path_form_with_no_semver_segment_returns_empty(self):
        from unifi.cams.base import _extract_uri_version

        # Same shape as the Protect 5.x URI but the version slot is
        # garbage — must not false-match any other segment.
        assert (
            _extract_uri_version(
                "https://h/internal/update/sav539gp/uvc/firmware/garbage/AABBCC5B04C3"
            )
            == ""
        )

    def test_rejects_non_semver_version_param(self):
        from unifi.cams.base import _extract_uri_version

        assert _extract_uri_version("https://h/u?version=garbage") == ""
        assert _extract_uri_version("https://h/u?version=5.2") == ""
        assert _extract_uri_version("https://h/u?version=v5.2.73") == ""


class TestComposeFwVersion:
    """v1.7.8 builds a full UVC firmware string from the model and the
    bare ``X.Y.Z`` semver pulled out of the upgrade URI. The platform
    comes from ``model_db``; the suffix mirrors ``FW_VERSION_TEMPLATE``
    so the result is fully shaped."""

    def test_builds_string_using_g6_ptz_platform(self):
        from unifi.cams.base import _compose_fw_version

        fw = _compose_fw_version("UVC G6 PTZ", "5.2.73")
        assert fw.startswith("UVC.SAV539GP.v5.2.73")
        assert ".7f45c5b.241212.1510" in fw

    def test_builds_string_using_g4_bullet_platform(self):
        from unifi.cams.base import _compose_fw_version

        fw = _compose_fw_version("UVC G4 Bullet", "4.79.55")
        assert fw.startswith("UVC.S5L.v4.79.55")

    def test_unknown_model_falls_back_to_default_platform(self):
        from unifi.cams.base import _compose_fw_version
        from unifi.model_db import DEFAULT_PLATFORM

        fw = _compose_fw_version("Definitely Not A UVC", "1.2.3")
        assert fw.startswith(f"UVC.{DEFAULT_PLATFORM.upper()}.v1.2.3")


class TestUpdateFirmwareRequestHandler:
    """v1.7.8: ``process_upgrade`` extracts the target version from the
    UpdateFirmwareRequest URI's ``version`` query param (Protect 4.x+)
    and composes a full UVC fw string via ``_compose_fw_version``. Falls
    back to v1.7.6's binary-header parse when the URI doesn't carry a
    version. The cycle finally breaks because the post-reconnect hello
    reports the version Protect actually wanted."""

    BASELINE = "UVC.SAV539GP.v4.69.55.0.7f45c5b.241212.1510"
    REAL_URI = (
        "https://unifi-protect:7444/internal/update?platform=sav539gp"
        "&product=uvc&updateType=firmware&version=5.2.73&mac=AABBCC5B04C3"
    )

    def _make_cam(self):
        import logging

        from unifi.cams.rtsp import RTSPCam

        cam = object.__new__(RTSPCam)
        cam.logger = logging.getLogger("test")
        cam._msg_id = 0
        cam._session = None

        class FakeArgs:
            fw_version = "UVC.SAV539GP.v4.69.55.0.7f45c5b.241212.1510"
            mac = "aa:bb:cc:11:22:33"
            model = "UVC G6 PTZ"

        cam.args = FakeArgs()
        return cam

    def _patch_aiohttp_session(self, monkeypatch, blob_or_exc):
        """Stub ``aiohttp.ClientSession`` for the binary-fallback path.
        The URI-extraction path never invokes aiohttp, so tests that go
        through it can skip this entirely (and any aiohttp use would
        be a regression)."""
        import unifi.cams.base as base_module

        class FakeContent:
            def __init__(self, blob):
                self.blob = blob

            async def readexactly(self, n):
                return self.blob[:n]

        class FakeResponse:
            def __init__(self, blob):
                self.content = FakeContent(blob)

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

        class FakeSession:
            def __init__(self, blob_or_exc):
                self._blob_or_exc = blob_or_exc

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            def get(self, url, headers=None, ssl=None):
                if isinstance(self._blob_or_exc, BaseException):
                    raise self._blob_or_exc
                return FakeResponse(self._blob_or_exc)

        monkeypatch.setattr(
            base_module.aiohttp,
            "ClientSession",
            lambda *a, **kw: FakeSession(blob_or_exc),
        )

    def test_process_upgrade_bumps_fw_version_from_uri(self, monkeypatch):
        """The Protect-4.x URI path: extract ``version=5.2.73`` from the
        query string and compose the new fwVersion. NO aiohttp call —
        guard against regression by patching it to raise."""
        import asyncio

        from unifi.cams.base import UnifiCamBase

        cam = self._make_cam()
        # If we accidentally hit aiohttp, this raise would propagate to
        # the warning branch and the test would still pass mutation, so
        # also assert the new fw matches the URI-path composer output.
        self._patch_aiohttp_session(
            monkeypatch, AssertionError("URI path must not call aiohttp")
        )

        async def run():
            await UnifiCamBase.process_upgrade(cam, {"payload": {"uri": self.REAL_URI}})

        asyncio.run(run())
        assert cam.args.fw_version == "UVC.SAV539GP.v5.2.73.0.7f45c5b.241212.1510"

    def test_process_upgrade_falls_back_to_binary_parse(self, monkeypatch):
        """No ``version`` in URI → fall back to the v1.7.6 binary parse.
        Provide a synthetic blob with a UVC-shape ASCII version."""
        import asyncio

        from unifi.cams.base import UnifiCamBase

        cam = self._make_cam()
        target = b"UVC.SAV539GP.v5.0.99.0.deadbeef.260101.0000"
        blob = b"\x00\x00\x00\x00" + target + b"\x00" * (54 - 4 - len(target))
        assert len(blob) == 54
        self._patch_aiohttp_session(monkeypatch, blob)

        async def run():
            await UnifiCamBase.process_upgrade(
                cam, {"payload": {"uri": "https://protect/firmware.bin"}}
            )

        asyncio.run(run())
        assert cam.args.fw_version == target.decode("ascii")

    def test_process_upgrade_keeps_fw_version_when_both_paths_fail(self, monkeypatch):
        """No URI version AND binary parse fails → no mutation, no raise."""
        import asyncio

        from unifi.cams.base import UnifiCamBase

        cam = self._make_cam()
        # All-NUL blob is structurally valid but produces "" from
        # _parse_firmware_version → caller keeps fw_version.
        self._patch_aiohttp_session(monkeypatch, b"\x00" * 54)

        async def run():
            await UnifiCamBase.process_upgrade(
                cam, {"payload": {"uri": "https://protect/firmware.bin"}}
            )

        asyncio.run(run())
        assert cam.args.fw_version == self.BASELINE

    def test_dispatch_acks_with_device_id_and_forces_reconnect(self, monkeypatch):
        """End-to-end via the URI path: process(UpdateFirmwareRequest)
        sends exactly the ACK with deviceID, no status events, no
        explicit close, returns True, and ``args.fw_version`` is bumped
        to the URI-composed value — that's the cycle-breaking change."""
        import asyncio
        import json

        from unifi.cams.base import UnifiCamBase

        cam = self._make_cam()
        sent: list[dict] = []

        async def fake_send(msg):
            sent.append(msg)

        cam.send = fake_send  # type: ignore[method-assign]
        # Guard: URI path must NOT touch aiohttp.
        self._patch_aiohttp_session(
            monkeypatch, AssertionError("URI path must not call aiohttp")
        )

        close_calls: list[dict] = []

        class FakeWS:
            async def close(self, code=None, reason=None):
                close_calls.append({"code": code, "reason": reason})

        cam._session = FakeWS()

        request = {
            "functionName": "UpdateFirmwareRequest",
            "messageId": 42,
            "responseExpected": True,
            "payload": {"uri": self.REAL_URI},
        }

        async def run():
            return await UnifiCamBase.process(cam, json.dumps(request).encode())

        force_reconnect = asyncio.run(run())
        assert force_reconnect is True
        assert len(sent) == 1, f"expected only the ACK, got {sent!r}"
        ack = sent[0]
        assert ack["functionName"] == "UpdateFirmwareRequest"
        assert ack["inResponseTo"] == 42
        assert ack["payload"] == {
            "statusCode": 0,
            "status": "ok",
            "deviceID": "AA:BB:CC:11:22:33",
        }
        assert close_calls == []
        assert cam.args.fw_version == "UVC.SAV539GP.v5.2.73.0.7f45c5b.241212.1510"


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
