import asyncio
import logging
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from unifi.cams.frigate import FrigateCam
from unifi.cams.handlers.snapshot_handlers import SnapshotHandlers


def test_snapshot_path_allowlist(tmp_path):
    h = SnapshotHandlers()
    h.logger = logging.getLogger("t")
    h.snapshot_dir = str(tmp_path)
    inside = tmp_path / "a.jpg"
    inside.write_bytes(b"x")
    assert h._is_allowed_snapshot_path(inside)
    assert h._is_allowed_snapshot_path(Path(tempfile.gettempdir(), "whatever.jpg"))
    assert not h._is_allowed_snapshot_path(Path("/etc/passwd"))
    assert not h._is_allowed_snapshot_path(
        tmp_path.joinpath(*[".."] * 8, "etc", "passwd")
    )


def test_snapshot_cache_keyed_by_object_type():
    cam = FrigateCam.__new__(FrigateCam)
    cam.logger = logging.getLogger("t")
    cam._label_snapshot_cache = {}
    cam.frigate_to_unifi_event_map = {}
    cam._active_smart_events = {}
    cam._mqtt_snapshot_path = None
    cam.notify_diagnostics_changed = MagicMock(side_effect=lambda: asyncio.sleep(0))
    cam.args = SimpleNamespace()

    def msg(label, retain=False):
        m = MagicMock()
        m.payload = b"jpg"
        m.retain = retain
        m.topic.value = f"frigate/cam/{label}/snapshot"
        return m

    asyncio.run(cam.handle_snapshot_event(msg("car")))
    asyncio.run(cam.handle_snapshot_event(msg("toaster")))
    assert list(cam._label_snapshot_cache) == ["vehicle"]


def test_core_handles_both_invalid_status_errors():
    import websockets.exceptions as we

    from unifi.core import _INVALID_STATUS_ERRORS

    assert we.InvalidStatus in _INVALID_STATUS_ERRORS
