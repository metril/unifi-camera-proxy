"""GridFusion composer camera: a free-positioning multi-camera matrix.

Each tile has its own position and size (in output-resolution pixels), so the
layout can be any arrangement — not just a uniform grid — and tiles may overlap
(tile order is z-order). A single ffmpeg ``filter_complex`` paints each input
onto a black base canvas with ``scale`` + ``overlay`` and publishes the result
once to the bundled go2rtc server. UniFi Protect and the web UI's live preview
both pull that single composed path (see ``unifi/web/go2rtc.py``).

The web UI presents this as **GridFusion** with a drag-and-drop editor; the
camera type key stays ``mosaic`` for compatibility.
"""

import argparse
import json
import logging
import subprocess
import tempfile
from pathlib import Path

from unifi.cams.base import UnifiCamBase
from unifi.utils import mask_url


class MosaicCam(UnifiCamBase):
    def __init__(self, args: argparse.Namespace, logger: logging.Logger) -> None:
        super().__init__(args, logger)
        self.args = args
        self.snapshot_dir = tempfile.mkdtemp()
        self.compose_proc: subprocess.Popen | None = None

        self.tiles = self._load_tiles(args)
        if not self.tiles:
            raise ValueError("GridFusion requires at least one tile (--tiles)")

        self.stream_name = args.stream_name
        self.publish_url = f"{args.go2rtc_rtsp.rstrip('/')}/{self.stream_name}"

    def _load_tiles(self, args: argparse.Namespace) -> list[dict]:
        """Return a normalized list of {url, x, y, w, h} tiles.

        Prefers the ``--tiles`` JSON model. Falls back to the legacy
        ``--input-urls`` + grid args (1.1.x configs) by laying them out in a
        uniform grid, so older mosaics keep working.
        """
        raw = getattr(args, "tiles", None)
        if raw:
            try:
                tiles = json.loads(raw)
            except (ValueError, TypeError) as e:
                raise ValueError(f"--tiles must be valid JSON: {e}")
            return [self._normalize_tile(t) for t in tiles if t.get("url")]

        # Legacy shim: uniform grid from --input-urls.
        urls = list(getattr(args, "input_urls", None) or [])
        if not urls:
            return []
        cols = max(1, int(getattr(args, "grid_cols", 2) or 2))
        rows = max(1, -(-len(urls) // cols))  # ceil
        tile_w = args.output_width // cols
        tile_h = args.output_height // rows
        return [
            {
                "url": url,
                "x": (i % cols) * tile_w,
                "y": (i // cols) * tile_h,
                "w": tile_w,
                "h": tile_h,
            }
            for i, url in enumerate(urls)
        ]

    @staticmethod
    def _normalize_tile(t: dict) -> dict:
        return {
            "url": t["url"],
            "x": int(t.get("x", 0)),
            "y": int(t.get("y", 0)),
            "w": int(t.get("w", 0)),
            "h": int(t.get("h", 0)),
        }

    @classmethod
    def add_parser(cls, parser: argparse.ArgumentParser) -> None:
        super().add_parser(parser)
        parser.add_argument(
            "--tiles",
            type=str,
            default=None,
            help=(
                "GridFusion layout as a JSON array of "
                '{"url","x","y","w","h"} tiles (output-resolution pixels)'
            ),
        )
        parser.add_argument(
            "--output-width",
            type=int,
            default=1920,
            help="Composited output width in pixels (default: 1920)",
        )
        parser.add_argument(
            "--output-height",
            type=int,
            default=1080,
            help="Composited output height in pixels (default: 1080)",
        )
        parser.add_argument(
            "--tile-fps",
            type=int,
            default=10,
            help="Frame rate of the composited output (default: 10)",
        )
        parser.add_argument(
            "--stream-name",
            type=str,
            default="mosaic",
            help="go2rtc stream path name to publish to (set to camera id)",
        )
        parser.add_argument(
            "--go2rtc-rtsp",
            type=str,
            default="rtsp://127.0.0.1:8554",
            help="Base RTSP URL of the bundled go2rtc server",
        )
        # Legacy (1.1.x) uniform-grid args, kept for back-compat.
        parser.add_argument("--input-urls", nargs="+", help=argparse.SUPPRESS)
        parser.add_argument("--grid-cols", type=int, default=2, help=argparse.SUPPRESS)
        parser.add_argument("--grid-rows", type=int, default=2, help=argparse.SUPPRESS)

    def _build_compose_cmd(self) -> str:
        fps = self.args.tile_fps
        width, height = self.args.output_width, self.args.output_height

        inputs = " ".join(
            f'-rtsp_transport {self.args.rtsp_transport} -i "{t["url"]}"'
            for t in self.tiles
        )

        # Black base canvas, then scale + overlay each tile at its own position.
        # Tile order is z-order, so later tiles paint over earlier ones.
        parts = [f"color=c=black:s={width}x{height}:r={fps}[bg]"]
        prev = "bg"
        for i, tile in enumerate(self.tiles):
            parts.append(f'[{i}:v]scale={tile["w"]}:{tile["h"]},setsar=1[v{i}]')
            out = f"t{i}"
            parts.append(f'[{prev}][v{i}]overlay={tile["x"]}:{tile["y"]}[{out}]')
            prev = out
        filter_complex = ";".join(parts)

        return (
            f"AV_LOG_FORCE_NOCOLOR=1 ffmpeg -nostdin "
            f"-loglevel level+{self.args.loglevel} -y "
            f"{inputs} "
            f'-filter_complex "{filter_complex}" -map "[{prev}]" '
            f"-map 0:a? -c:a aac -ar 32000 -ac 1 -b:a 32k "
            f"-c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p "
            f"-g {fps * 2} -f rtsp -rtsp_transport tcp {self.publish_url}"
        )

    def start_compose(self) -> None:
        if self.compose_proc and self.compose_proc.poll() is None:
            return
        cmd = self._build_compose_cmd()
        self.logger.info(f"Spawning GridFusion compose: {mask_url(cmd)}")
        self.compose_proc = subprocess.Popen(
            cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=True
        )

    async def run(self) -> None:
        # Publish the composed stream to go2rtc once; all consumers pull from it.
        self.start_compose()

    async def close(self) -> None:
        await super().close()
        if self.compose_proc:
            self.compose_proc.kill()

    async def get_stream_source(self, stream_index: str) -> str:
        # Every quality tier reads the single composed go2rtc path; go2rtc fans
        # the one compose out to UniFi's three pipeline readers + the browser.
        if self.compose_proc is None or self.compose_proc.poll() is not None:
            self.start_compose()
        return self.publish_url

    async def get_snapshot(self) -> Path:
        img_file = Path(self.snapshot_dir, "screen.jpg")
        cmd = (
            f"AV_LOG_FORCE_NOCOLOR=1 ffmpeg -nostdin -y "
            f"-loglevel level+{self.args.loglevel} "
            f'-rtsp_transport tcp -i "{self.publish_url}" '
            f"-frames:v 1 -update 1 {img_file}"
        )
        proc = subprocess.Popen(
            cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=True
        )
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        return img_file
