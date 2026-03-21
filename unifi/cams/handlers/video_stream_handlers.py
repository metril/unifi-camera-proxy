import asyncio
import json
import os
import signal
import subprocess
import sys
import time
from collections import deque
from dataclasses import dataclass, field


@dataclass
class StreamState:
    process: subprocess.Popen
    stream_name: str
    destination: tuple[str, int]
    restart_count: int = 0
    restart_timestamps: deque = field(default_factory=lambda: deque(maxlen=5))
    last_start_time: float = field(default_factory=time.time)


WATCHDOG_INTERVAL = 30  # seconds
MAX_RESTARTS = 5
RESTART_WINDOW = 600  # 10 minutes


class VideoStreamHandlers:
    """Mixin class providing video stream management functionality"""

    def get_extra_ffmpeg_args(self, stream_index: str = "") -> str:
        return self.args.ffmpeg_args

    def get_base_ffmpeg_args(self, stream_index: str = "") -> str:
        if self.args.ffmpeg_base_args is not None:
            return self.args.ffmpeg_base_args

        base_args = [
            "-avoid_negative_ts",
            "make_zero",
            "-fflags",
            "+genpts+discardcorrupt",
            "-use_wallclock_as_timestamps 1",
        ]

        try:
            output = subprocess.check_output(["ffmpeg", "-h", "full"])
            if b"stimeout" in output:
                base_args.append("-stimeout 15000000")
            else:
                base_args.append("-timeout 15000000")
        except subprocess.CalledProcessError:
            self.logger.exception("Could not check for ffmpeg options")

        return " ".join(base_args)

    def probe_video_resolution(self, stream_index: str, source_url: str) -> tuple[int, int]:
        """Probe video source to detect width and height using ffprobe"""
        # Get default resolution for this stream
        default_width, default_height = self._detected_resolutions[stream_index]
        
        try:
            cmd = [
                'ffprobe',
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height',
                '-of', 'json',
                '-rtsp_transport', self.args.rtsp_transport,
                source_url
            ]
            from unifi.utils import mask_url
            self.logger.info(f"Probing {stream_index} source: {mask_url(source_url)}")
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True, 
                timeout=15
            )
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                if data.get('streams') and len(data['streams']) > 0:
                    width = data['streams'][0].get('width', default_width)
                    height = data['streams'][0].get('height', default_height)
                    self.logger.info(f"Detected {stream_index} resolution: {width}x{height}")
                    return width, height
                    
        except subprocess.TimeoutExpired:
            self.logger.warning(f"{stream_index} probe timed out after 15 seconds, using defaults")
        except json.JSONDecodeError as e:
            self.logger.warning(f"Could not parse ffprobe output for {stream_index}: {e}, using defaults")
        except Exception as e:
            self.logger.warning(f"Could not probe {stream_index} source: {e}, using defaults")
        
        # Fallback to defaults for this stream
        self.logger.info(f"Using default resolution for {stream_index}: {default_width}x{default_height}")
        return default_width, default_height

    async def start_video_stream(
        self, stream_index: str, stream_name: str, destination: tuple[str, int]
    ):
        has_spawned = stream_index in self._ffmpeg_handles
        is_dead = has_spawned and self._ffmpeg_handles[stream_index].process.poll() is not None

        if not has_spawned or is_dead:
            source = await self.get_stream_source(stream_index)
            cmd = (
                f"AV_LOG_FORCE_NOCOLOR=1 ffmpeg -nostdin -loglevel level+{self.args.loglevel} -y"
                f" {self.get_base_ffmpeg_args(stream_index)} -rtsp_transport"
                f' {self.args.rtsp_transport} -i "{source}"'
                f" {self.get_extra_ffmpeg_args(stream_index)} -metadata"
                f" streamName={stream_name} -f {self.args.format} - "
                f" | {sys.executable} -m unifi.clock_sync --timestamp-modifier {self.args.timestamp_modifier}"
                f" | nc"
                f" {destination[0]} {destination[1]}"
            )

            # Preserve restart tracking from previous state
            prev_restart_count = 0
            prev_restart_timestamps = deque(maxlen=5)
            if is_dead:
                prev_state = self._ffmpeg_handles[stream_index]
                prev_restart_count = prev_state.restart_count
                prev_restart_timestamps = prev_state.restart_timestamps
                exit_code = prev_state.process.poll()
                self.logger.warning(f"Previous ffmpeg process for {stream_index} died with exit code {exit_code}.")

            from unifi.utils import mask_url
            self.logger.info(
                f"Spawning ffmpeg for {stream_index} ({stream_name}): {mask_url(cmd)}"
            )
            # Start process in a new process group so we can kill the entire pipeline
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                shell=True,
                preexec_fn=os.setsid  # Create new process group
            )
            self._ffmpeg_handles[stream_index] = StreamState(
                process=proc,
                stream_name=stream_name,
                destination=destination,
                restart_count=prev_restart_count,
                restart_timestamps=prev_restart_timestamps,
            )

    def stop_video_stream(self, stream_index: str):
        if stream_index in self._ffmpeg_handles:
            self.logger.info(f"Stopping stream {stream_index}")
            proc = self._ffmpeg_handles[stream_index].process
            
            # Check if process is already dead
            if proc.poll() is not None:
                self.logger.debug(f"Process for {stream_index} already terminated with code {proc.poll()}")
                del self._ffmpeg_handles[stream_index]
                return
            
            try:
                # Terminate the process group to kill all processes in the pipeline
                pgid = os.getpgid(proc.pid)
                self.logger.debug(f"Sending SIGTERM to process group {pgid} for {stream_index}")
                os.killpg(pgid, signal.SIGTERM)
                
                # Wait for graceful shutdown
                try:
                    proc.wait(timeout=2)
                    self.logger.debug(f"Stream {stream_index} terminated gracefully")
                except subprocess.TimeoutExpired:
                    self.logger.warning(f"Stream {stream_index} did not terminate gracefully, sending SIGKILL")
                    try:
                        os.killpg(pgid, signal.SIGKILL)
                        proc.wait(timeout=1)
                    except (ProcessLookupError, subprocess.TimeoutExpired):
                        pass
                        
            except (ProcessLookupError, PermissionError, AttributeError, OSError) as e:
                self.logger.debug(f"Error stopping {stream_index}: {e}, trying proc.kill()")
                # Fall back to killing just the parent process
                try:
                    proc.kill()
                    proc.wait(timeout=1)
                except Exception:
                    pass
            
            # Remove from handles
            del self._ffmpeg_handles[stream_index]

    async def _stream_health_watchdog(self) -> None:
        """Periodically check FFmpeg process health and restart dead streams."""
        while True:
            await asyncio.sleep(WATCHDOG_INTERVAL)
            for stream_index in list(self._ffmpeg_handles.keys()):
                state = self._ffmpeg_handles.get(stream_index)
                if state is None:
                    continue

                exit_code = state.process.poll()
                if exit_code is None:
                    continue  # Process is alive

                uptime = time.time() - state.last_start_time
                self.logger.warning(
                    f"Watchdog: FFmpeg for {stream_index} ({state.stream_name}) "
                    f"died with exit code {exit_code} "
                    f"(was running for {uptime:.1f}s, "
                    f"restart count: {state.restart_count})"
                )

                # Check restart rate limit
                now = time.time()
                while state.restart_timestamps and (now - state.restart_timestamps[0]) > RESTART_WINDOW:
                    state.restart_timestamps.popleft()

                if len(state.restart_timestamps) >= MAX_RESTARTS:
                    self.logger.error(
                        f"Watchdog: {stream_index} has restarted {MAX_RESTARTS} times "
                        f"in the last {RESTART_WINDOW}s. Giving up until Protect re-requests."
                    )
                    del self._ffmpeg_handles[stream_index]
                    continue

                # Attempt restart
                state.restart_count += 1
                state.restart_timestamps.append(now)
                saved_name = state.stream_name
                saved_dest = state.destination
                saved_count = state.restart_count
                saved_timestamps = state.restart_timestamps

                # Remove dead handle so start_video_stream treats it as fresh
                del self._ffmpeg_handles[stream_index]

                try:
                    await self.start_video_stream(stream_index, saved_name, saved_dest)
                    # Restore restart tracking on the new StreamState
                    if stream_index in self._ffmpeg_handles:
                        new_state = self._ffmpeg_handles[stream_index]
                        new_state.restart_count = saved_count
                        new_state.restart_timestamps = saved_timestamps
                        self.logger.info(
                            f"Watchdog: Restarted {stream_index} successfully "
                            f"(restart #{saved_count})"
                        )
                except Exception:
                    self.logger.exception(
                        f"Watchdog: Failed to restart {stream_index}"
                    )

    def close_streams(self):
        for stream in list(self._ffmpeg_handles):
            self.stop_video_stream(stream)
