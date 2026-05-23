"""GridFusion composer camera — a free-positioning multi-camera matrix.

The actual compositing is owned by the bundled go2rtc server as an ``exec:``
stream (see ``unifi/web/go2rtc.py`` ``build_mosaic_exec``): go2rtc runs one
ffmpeg that paints each tile onto a black canvas with ``scale``+``overlay`` and
serves the result. This camera process therefore just *sources* that single
composed go2rtc path — UniFi Protect's three pipeline readers and the web UI's
preview all pull it, so the compose runs once.

The web UI presents this as **GridFusion**; the camera type key stays ``mosaic``.
"""

import argparse
import logging
import subprocess
import tempfile
from pathlib import Path

from unifi.cams.base import UnifiCamBase


class MosaicCam(UnifiCamBase):
    def __init__(self, args: argparse.Namespace, logger: logging.Logger) -> None:
        super().__init__(args, logger)
        self.args = args
        self.snapshot_dir = tempfile.mkdtemp()
        self.stream_name = args.stream_name
        self.source_url = f"{args.go2rtc_rtsp.rstrip('/')}/{self.stream_name}"

    @classmethod
    def add_parser(cls, parser: argparse.ArgumentParser) -> None:
        super().add_parser(parser)
        # Geometry/layout live in the camera config and are consumed by the web
        # server when it registers the go2rtc exec: stream — not here. These
        # remain so the schema/validation and CLI stay stable.
        parser.add_argument("--tiles", type=str, default=None, help=argparse.SUPPRESS)
        parser.add_argument(
            "--output-width", type=int, default=1920, help=argparse.SUPPRESS
        )
        parser.add_argument(
            "--output-height", type=int, default=1080, help=argparse.SUPPRESS
        )
        parser.add_argument("--tile-fps", type=int, default=10, help=argparse.SUPPRESS)
        parser.add_argument(
            "--stream-name",
            type=str,
            default="mosaic",
            help="go2rtc stream path this composition is served under (camera id)",
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

    async def run(self) -> None:
        return

    def probe_video_resolution(
        self, stream_index: str, source_url: str
    ) -> tuple[int, int]:
        # The mosaic's output dimensions are configured (--output-width /
        # --output-height) and the base class' default ffprobe takes the full
        # 15s timeout when go2rtc's exec stream hasn't started producing yet
        # — long enough for UniFi Protect to drop the adoption WebSocket before
        # init_adoption can send its hello. Skip the probe entirely; we already
        # know the answer.
        return (int(self.args.output_width), int(self.args.output_height))

    async def get_stream_source(self, stream_index: str) -> str:
        # Every quality tier reads the single composed go2rtc path; go2rtc fans
        # the one exec compose out to UniFi's readers and the browser.
        return self.source_url

    async def get_snapshot(self) -> Path:
        img_file = Path(self.snapshot_dir, "screen.jpg")
        cmd = (
            f"AV_LOG_FORCE_NOCOLOR=1 ffmpeg -nostdin -y "
            f"-loglevel level+{self.args.loglevel} "
            f'-rtsp_transport tcp -i "{self.source_url}" '
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
