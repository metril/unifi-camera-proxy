"""Mosaic composer camera: tile N RTSP feeds into one UniFi camera.

A single ffmpeg ``filter_complex`` scales each input to a grid cell and stacks
them into one composited stream that is *published once* to the bundled go2rtc
server. UniFi Protect and the web UI's live preview both pull that single
go2rtc path, so the expensive compose+encode runs only once regardless of how
many consumers attach (see ``unifi/web/go2rtc.py``).
"""

import argparse
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

        self.input_urls: list[str] = list(args.input_urls or [])
        if not self.input_urls:
            raise ValueError("--input-urls requires at least one RTSP URL")

        cols = max(1, int(args.grid_cols))
        rows = max(1, int(args.grid_rows))
        if cols * rows < len(self.input_urls):
            # Grow rows to fit all inputs rather than dropping feeds silently.
            rows = -(-len(self.input_urls) // cols)
            self.logger.warning(
                f"grid {args.grid_cols}x{args.grid_rows} too small for "
                f"{len(self.input_urls)} inputs; using {cols}x{rows}"
            )
        self.cols, self.rows = cols, rows

        # The go2rtc RTSP path this mosaic publishes to (named by camera id so
        # the web server's preview can find it without extra registration).
        self.stream_name = args.stream_name
        self.publish_url = f"{args.go2rtc_rtsp.rstrip('/')}/{self.stream_name}"

    @classmethod
    def add_parser(cls, parser: argparse.ArgumentParser) -> None:
        super().add_parser(parser)
        parser.add_argument(
            "--input-urls",
            nargs="+",
            required=True,
            help="RTSP source URLs to tile into the mosaic (one per cell)",
        )
        parser.add_argument(
            "--grid-cols",
            type=int,
            default=2,
            help="Number of mosaic columns (default: 2)",
        )
        parser.add_argument(
            "--grid-rows",
            type=int,
            default=2,
            help="Number of mosaic rows (default: 2)",
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
            help="Frame rate per tile (default: 10)",
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

    def _build_compose_cmd(self) -> str:
        n = len(self.input_urls)
        tile_w = self.args.output_width // self.cols
        tile_h = self.args.output_height // self.rows
        fps = self.args.tile_fps

        inputs = " ".join(
            f"-rtsp_transport {self.args.rtsp_transport} " f'-i "{url}"'
            for url in self.input_urls
        )

        # Scale each input to a cell, then xstack them onto the grid using
        # absolute pixel offsets (all cells are equal-sized).
        scales = ";".join(
            f"[{i}:v]scale={tile_w}:{tile_h}:force_original_aspect_ratio=decrease,"
            f"pad={tile_w}:{tile_h}:(ow-iw)/2:(oh-ih)/2,fps={fps},setsar=1[v{i}]"
            for i in range(n)
        )
        refs = "".join(f"[v{i}]" for i in range(n))
        layout = "|".join(
            f"{(i % self.cols) * tile_w}_{(i // self.cols) * tile_h}" for i in range(n)
        )
        filter_complex = (
            f"{scales};{refs}xstack=inputs={n}:layout={layout}:fill=black[out]"
        )

        return (
            f"AV_LOG_FORCE_NOCOLOR=1 ffmpeg -nostdin -loglevel level+{self.args.loglevel} -y "
            f"{inputs} "
            f'-filter_complex "{filter_complex}" -map "[out]" '
            f"-map 0:a? -c:a aac -ar 32000 -ac 1 -b:a 32k "
            f"-c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p "
            f"-g {fps * 2} -f rtsp -rtsp_transport tcp {self.publish_url}"
        )

    def start_compose(self) -> None:
        if self.compose_proc and self.compose_proc.poll() is None:
            return
        cmd = self._build_compose_cmd()
        self.logger.info(f"Spawning mosaic compose: {mask_url(cmd)}")
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
