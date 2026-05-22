"""Manage a bundled go2rtc streaming server used for live preview and mosaics.

go2rtc is *not* a transcoder — it ingests each stream once and fans it out to
WebRTC/MSE/MJPEG/RTSP consumers without re-encoding. We run it as a managed
subprocess (mirroring how camera processes are launched in ``CameraManager``)
and register one pull stream per camera so the web UI can show live video for
every camera type, not just Frigate.

The aiohttp server reverse-proxies go2rtc's HTTP/WS API under ``/go2rtc/*`` so
the existing OIDC auth and CSP headers cover it and only one port is exposed.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import urllib.parse
from pathlib import Path
from typing import Optional

import aiohttp as aiohttp_client
import yaml

from unifi.web.config import inject_rtsp_credentials

logger = logging.getLogger("Go2rtc")

# go2rtc's internal listen addresses. Bound to loopback only; browser traffic is
# reverse-proxied through the aiohttp server, so nothing here is exposed directly.
API_HOST = "127.0.0.1"
API_PORT = 1984
RTSP_HOST = "127.0.0.1"
RTSP_PORT = 8554

API_BASE = f"http://{API_HOST}:{API_PORT}"
# RTSP base that camera subprocesses publish mosaics to / pull composed streams from.
RTSP_BASE = f"rtsp://{RTSP_HOST}:{RTSP_PORT}"


def _q(value: str | None) -> str:
    return urllib.parse.quote(value or "", safe="")


def resolve_stream_source(global_config: dict, camera_config: dict) -> Optional[str]:
    """Best-effort RTSP/source URL for a camera, for go2rtc live preview.

    Reuses :func:`inject_rtsp_credentials` and the per-camera→global RTSP
    credential fallback already used by ``config_to_args``. First-class support
    for the rtsp/frigate/tapo/mosaic types (the primary Frigate-based stack);
    vendor types fall back to their standard RTSP URL layout.
    """
    cam_type = camera_config.get("type", "rtsp")

    rtsp_user = camera_config.get("rtsp_username") or global_config.get("rtsp_username")
    rtsp_pass = camera_config.get("rtsp_password") or global_config.get("rtsp_password")

    def with_creds(url: str) -> str:
        return inject_rtsp_credentials(url, rtsp_user, rtsp_pass)

    if cam_type == "mosaic":
        # The mosaic camera process publishes its composed stream to go2rtc's
        # RTSP server under its camera id, so the path already exists there.
        cam_id = camera_config.get("id")
        return f"{RTSP_BASE}/{cam_id}" if cam_id else None

    if cam_type in ("rtsp", "frigate"):
        # Prefer the medium tier for preview to save bandwidth; fall back to high.
        url = camera_config.get("video2") or camera_config.get("video1")
        return with_creds(url) if url else None

    if cam_type == "tapo":
        base = camera_config.get("rtsp")
        return with_creds(f"{base.rstrip('/')}/stream2") if base else None

    # Vendor backends: construct their conventional RTSP URL (best effort).
    ip = camera_config.get("ip")
    if not ip:
        return None
    user = _q(camera_config.get("username"))
    pw = _q(camera_config.get("password"))

    if cam_type == "reolink":
        channel = int(camera_config.get("channel", 0))
        substream = camera_config.get("substream", "sub")
        return f"rtsp://{user}:{pw}@{ip}:554//h264Preview_{channel + 1:02d}_{substream}"
    if cam_type == "hikvision":
        channel = camera_config.get("channel", 1)
        substream = camera_config.get("substream", 3)
        return f"rtsp://{user}:{pw}@{ip}:554/Streaming/Channels/{channel}0{substream}/"
    if cam_type in ("dahua", "amcrest", "lorex"):
        channel = camera_config.get("channel", 1)
        return (
            f"rtsp://{user}:{pw}@{ip}:554/cam/realmonitor?channel={channel}&subtype=1"
        )

    return None


def resolve_mosaic_tiles(global_config: dict, camera_config: dict) -> list[dict]:
    """Resolve a GridFusion layout to concrete input tiles for compositing.

    Each tile becomes ``{url, x, y, w, h}`` where ``url`` is either an existing
    camera pulled from go2rtc (``source`` → ``rtsp://127.0.0.1:8554/<id>``, so the
    real camera is connected only once) or a raw RTSP url with credentials
    injected. Zero/negative-size tiles are dropped. Falls back to a uniform grid
    for legacy 1.1.x ``input_urls`` configs.
    """
    rtsp_user = camera_config.get("rtsp_username") or global_config.get("rtsp_username")
    rtsp_pass = camera_config.get("rtsp_password") or global_config.get("rtsp_password")

    raw = camera_config.get("tiles")
    if not raw:
        # Legacy uniform-grid shim.
        urls = camera_config.get("input_urls") or []
        if not urls:
            return []
        cols = max(1, int(camera_config.get("grid_cols", 2) or 2))
        rows = max(1, -(-len(urls) // cols))
        out_w = int(camera_config.get("output_width", 1920) or 1920)
        out_h = int(camera_config.get("output_height", 1080) or 1080)
        tw, th = out_w // cols, out_h // rows
        raw = [
            {"url": u, "x": (i % cols) * tw, "y": (i // cols) * th, "w": tw, "h": th}
            for i, u in enumerate(urls)
        ]

    resolved = []
    for tile in raw:
        source = tile.get("source")
        url = tile.get("url")
        if source:
            input_url = f"{RTSP_BASE}/{source}"
        elif url:
            input_url = inject_rtsp_credentials(url, rtsp_user, rtsp_pass)
        else:
            continue
        w, h = int(tile.get("w", 0)), int(tile.get("h", 0))
        if w <= 0 or h <= 0:
            continue
        resolved.append(
            {
                "url": input_url,
                "x": int(tile.get("x", 0)),
                "y": int(tile.get("y", 0)),
                "w": w,
                "h": h,
            }
        )
    return resolved


def build_mosaic_exec(tiles: list[dict], out_w: int, out_h: int, fps: int) -> str:
    """Build a go2rtc ``exec:`` source that composites tiles into one stream.

    go2rtc runs and owns this ffmpeg process and serves the result, substituting
    ``{output}`` with its internal RTSP target — the documented, debuggable
    pattern (verified: serves valid H.264 over RTSP + HLS).
    """
    inputs = " ".join(f'-rtsp_transport tcp -i "{t["url"]}"' for t in tiles)
    # Black base canvas, then scale + overlay each tile at its own position
    # (tile order = z-order, overlaps allowed).
    parts = [f"color=c=black:s={out_w}x{out_h}:r={fps}[bg]"]
    prev = "bg"
    for i, t in enumerate(tiles):
        parts.append(f'[{i}:v]scale={t["w"]}:{t["h"]},setsar=1[v{i}]')
        out = f"t{i}"
        parts.append(f'[{prev}][v{i}]overlay={t["x"]}:{t["y"]}[{out}]')
        prev = out
    filter_complex = ";".join(parts)
    return (
        f"exec:ffmpeg -hide_banner -loglevel error {inputs} "
        f'-filter_complex "{filter_complex}" -map "[{prev}]" '
        f"-an -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p "
        f"-g {fps * 2} -rtsp_transport tcp -f rtsp {{output}}"
    )


class Go2rtcManager:
    """Lifecycle + dynamic stream registration for the bundled go2rtc server."""

    def __init__(self, data_dir: str = "/app/data") -> None:
        self.data_dir = Path(data_dir)
        self.process: Optional[asyncio.subprocess.Process] = None
        self._log_task: Optional[asyncio.Task] = None
        self._available = shutil.which("go2rtc") is not None

    @property
    def available(self) -> bool:
        return self._available

    def _build_streams(self, config: dict) -> dict:
        """Build the go2rtc ``streams`` map from the app config.

        Regular cameras become a pull source; GridFusion (mosaic) cameras become
        an ``exec:`` compositing source. go2rtc only accepts ``exec:`` from its
        config file (not the API), so the config file is our source of truth.
        """
        global_config = config.get("global", {})
        streams: dict[str, str] = {}
        for cam in config.get("cameras", []):
            cam_id = cam.get("id")
            if not cam_id:
                continue
            if cam.get("type") == "mosaic":
                tiles = resolve_mosaic_tiles(global_config, cam)
                if tiles:
                    streams[cam_id] = build_mosaic_exec(
                        tiles,
                        int(cam.get("output_width", 1920) or 1920),
                        int(cam.get("output_height", 1080) or 1080),
                        int(cam.get("tile_fps", 10) or 10),
                    )
            else:
                source = resolve_stream_source(global_config, cam)
                if source:
                    streams[cam_id] = source
        return streams

    def _write_config(self, config: dict) -> Path:
        """Write the full go2rtc config (all streams baked in)."""
        doc = {
            "api": {"listen": f"{API_HOST}:{API_PORT}"},
            "rtsp": {"listen": f"{RTSP_HOST}:{RTSP_PORT}"},
            # WebRTC candidates: rely on host networking / the reverse proxy.
            "webrtc": {"listen": ":8555"},
            "log": {"level": "warn"},
            "streams": self._build_streams(config),
        }
        path = self.data_dir / "go2rtc.yaml"
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            yaml.dump(doc, f, default_flow_style=False, sort_keys=False)
        return path

    async def start(self, config: dict) -> None:
        if not self._available:
            logger.warning(
                "go2rtc binary not found on PATH; live preview and mosaic "
                "streaming are disabled"
            )
            return
        if self.process and self.process.returncode is None:
            return
        config_path = self._write_config(config)
        logger.info(f"Starting go2rtc (config: {config_path})")
        try:
            self.process = await asyncio.create_subprocess_exec(
                "go2rtc",
                "-config",
                str(config_path),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
        except Exception as e:
            logger.error(f"Failed to start go2rtc: {e}")
            self.process = None
            return
        self._log_task = asyncio.create_task(self._drain_logs())
        # Give go2rtc a moment to bind its API before callers register streams.
        await self._wait_until_ready(timeout=10.0)

    async def _wait_until_ready(self, timeout: float) -> bool:
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            try:
                async with aiohttp_client.ClientSession() as session:
                    async with session.get(
                        f"{API_BASE}/api",
                        timeout=aiohttp_client.ClientTimeout(total=1),
                    ) as resp:
                        if resp.status < 500:
                            logger.info("go2rtc API is ready")
                            return True
            except Exception:
                await asyncio.sleep(0.3)
        logger.warning("go2rtc did not become ready within timeout")
        return False

    async def _drain_logs(self) -> None:
        if not self.process or not self.process.stdout:
            return
        try:
            while True:
                line = await self.process.stdout.readline()
                if not line:
                    break
                logger.debug(f"[go2rtc] {line.decode('utf-8', 'replace').rstrip()}")
        except Exception:
            pass

    async def stop(self) -> None:
        if self._log_task and not self._log_task.done():
            self._log_task.cancel()
        if self.process and self.process.returncode is None:
            logger.info("Stopping go2rtc")
            try:
                self.process.terminate()
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                self.process.kill()
                await self.process.wait()
            except ProcessLookupError:
                pass
        self.process = None

    async def apply_config(self, config: dict) -> None:
        """Rewrite the go2rtc config from the app config and (re)start go2rtc.

        go2rtc reads streams (especially ``exec:`` mosaics, which it refuses via
        the API) from its config file, so a config change means rewrite +
        restart. It comes back in ~1s and browser HLS players reconnect on their
        own. Camera add/edit/delete and global-settings saves are infrequent, so
        the brief blip is acceptable.
        """
        if not self._available:
            return
        await self.stop()
        await self.start(config)
