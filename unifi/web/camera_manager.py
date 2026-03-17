from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from unifi.web.config import config_to_args, load_config, save_config

logger = logging.getLogger("CameraManager")


@dataclass
class CameraInstance:
    id: str
    config: dict
    process: Optional[asyncio.subprocess.Process] = None
    status: str = "stopped"  # stopped, running, error
    exit_code: Optional[int] = None
    error_message: Optional[str] = None
    log_buffer: deque = field(default_factory=lambda: deque(maxlen=500))
    started_at: Optional[float] = None
    _log_task: Optional[asyncio.Task] = None


class CameraManager:
    def __init__(self, config_path: str):
        self.config_path = config_path
        self.config = load_config(config_path)
        self.instances: dict[str, CameraInstance] = {}
        self._monitor_task: Optional[asyncio.Task] = None

        # Initialize instances from config
        for cam_config in self.config.get("cameras", []):
            cam_id = cam_config["id"]
            self.instances[cam_id] = CameraInstance(id=cam_id, config=cam_config)

    def reload_config(self):
        self.config = load_config(self.config_path)
        # Update existing instances and add new ones
        config_ids = set()
        for cam_config in self.config.get("cameras", []):
            cam_id = cam_config["id"]
            config_ids.add(cam_id)
            if cam_id in self.instances:
                self.instances[cam_id].config = cam_config
            else:
                self.instances[cam_id] = CameraInstance(id=cam_id, config=cam_config)
        # Remove instances that are no longer in config (if stopped)
        for cam_id in list(self.instances.keys()):
            if cam_id not in config_ids and self.instances[cam_id].status == "stopped":
                del self.instances[cam_id]

    async def start_camera(self, camera_id: str) -> None:
        instance = self.instances.get(camera_id)
        if not instance:
            raise ValueError(f"Camera {camera_id} not found")
        if instance.status == "running":
            return

        global_config = self.config.get("global", {})
        args = config_to_args(global_config, instance.config)

        # Mask credentials in logged command
        sensitive_flags = {'--token', '--nvr-password', '--api-key', '--mqtt-password'}
        masked = list(args)
        for i, arg in enumerate(masked):
            if arg in sensitive_flags and i + 1 < len(masked):
                masked[i + 1] = '***'
        masked_str = re.sub(r'://[^@]+@', '://***:***@', ' '.join(masked))
        logger.info(f"Starting camera {camera_id}: unifi-cam-proxy {masked_str}")

        try:
            process = await asyncio.create_subprocess_exec(
                "unifi-cam-proxy",
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            instance.process = process
            instance.status = "running"
            instance.exit_code = None
            instance.error_message = None
            instance.started_at = time.time()
            instance.log_buffer.clear()

            # Start log reader tasks
            instance._log_task = asyncio.create_task(
                self._read_logs(instance)
            )
        except Exception as e:
            instance.status = "error"
            instance.error_message = str(e)
            logger.error(f"Failed to start camera {camera_id}: {e}")

    async def _read_logs(self, instance: CameraInstance) -> None:
        """Read stdout and stderr from the subprocess into the log buffer."""
        async def read_stream(stream):
            try:
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").rstrip()
                    if decoded:
                        instance.log_buffer.append(decoded)
            except Exception as e:
                logger.error(f"Error reading stream for camera {instance.id}: {e}")

        if instance.process:
            tasks = []
            if instance.process.stdout:
                tasks.append(asyncio.create_task(read_stream(instance.process.stdout)))
            if instance.process.stderr:
                tasks.append(asyncio.create_task(read_stream(instance.process.stderr)))
            if tasks:
                await asyncio.gather(*tasks)

            # Process has exited
            returncode = await instance.process.wait()
            if instance.status == "running":
                instance.exit_code = returncode
                if returncode != 0:
                    instance.status = "error"
                    # Include last log lines in error message for visibility
                    last_lines = list(instance.log_buffer)[-5:]
                    error_detail = "\n".join(last_lines) if last_lines else "No output captured"
                    instance.error_message = f"Process exited with code {returncode}: {error_detail}"
                    logger.warning(
                        f"Camera {instance.id} exited with code {returncode}. "
                        f"Last output: {error_detail}"
                    )
                else:
                    instance.status = "stopped"

    async def stop_camera(self, camera_id: str) -> None:
        instance = self.instances.get(camera_id)
        if not instance:
            raise ValueError(f"Camera {camera_id} not found")
        if instance.status != "running" or not instance.process:
            instance.status = "stopped"
            return

        logger.info(f"Stopping camera {camera_id}")
        try:
            instance.process.terminate()
            try:
                await asyncio.wait_for(instance.process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning(f"Camera {camera_id} did not stop gracefully, killing")
                instance.process.kill()
                await instance.process.wait()
        except ProcessLookupError:
            pass

        instance.status = "stopped"
        instance.process = None
        instance.started_at = None

        if instance._log_task and not instance._log_task.done():
            instance._log_task.cancel()
            try:
                await instance._log_task
            except asyncio.CancelledError:
                pass

    async def restart_camera(self, camera_id: str) -> None:
        await self.stop_camera(camera_id)
        await asyncio.sleep(1)
        await self.start_camera(camera_id)

    def get_status(self, camera_id: str) -> dict:
        instance = self.instances.get(camera_id)
        if not instance:
            raise ValueError(f"Camera {camera_id} not found")
        return self._instance_to_dict(instance)

    def get_all_statuses(self) -> list[dict]:
        return [self._instance_to_dict(inst) for inst in self.instances.values()]

    def _instance_to_dict(self, instance: CameraInstance) -> dict:
        uptime = None
        if instance.started_at and instance.status == "running":
            uptime = int(time.time() - instance.started_at)
        pid = None
        if instance.process and instance.status == "running":
            pid = instance.process.pid
        return {
            "id": instance.id,
            "config": instance.config,
            "status": instance.status,
            "exit_code": instance.exit_code,
            "error_message": instance.error_message,
            "uptime": uptime,
            "pid": pid,
        }

    async def start_all_enabled(self) -> None:
        for cam_config in self.config.get("cameras", []):
            if cam_config.get("enabled", True):
                cam_id = cam_config["id"]
                if cam_id in self.instances and self.instances[cam_id].status != "running":
                    await self.start_camera(cam_id)
                    await asyncio.sleep(1.5)  # Stagger startup

    async def stop_all(self) -> None:
        tasks = []
        for cam_id, instance in self.instances.items():
            if instance.status == "running":
                tasks.append(self.stop_camera(cam_id))
        if tasks:
            await asyncio.gather(*tasks)

    def add_camera(self, camera_config: dict) -> dict:
        """Add a new camera to config and return it with generated id."""
        if "id" not in camera_config:
            camera_config["id"] = str(__import__("uuid").uuid4())[:8]
        self.config.setdefault("cameras", []).append(camera_config)
        save_config(self.config_path, self.config)
        cam_id = camera_config["id"]
        self.instances[cam_id] = CameraInstance(id=cam_id, config=camera_config)
        return camera_config

    def update_camera(self, camera_id: str, camera_config: dict) -> dict:
        """Update an existing camera's config."""
        camera_config["id"] = camera_id
        for i, cam in enumerate(self.config.get("cameras", [])):
            if cam.get("id") == camera_id:
                self.config["cameras"][i] = camera_config
                break
        else:
            raise ValueError(f"Camera {camera_id} not found in config")
        save_config(self.config_path, self.config)
        if camera_id in self.instances:
            self.instances[camera_id].config = camera_config
        return camera_config

    async def delete_camera(self, camera_id: str) -> None:
        """Delete a camera (stop first if running)."""
        if camera_id in self.instances and self.instances[camera_id].status == "running":
            await self.stop_camera(camera_id)
        self.config["cameras"] = [
            c for c in self.config.get("cameras", []) if c.get("id") != camera_id
        ]
        save_config(self.config_path, self.config)
        self.instances.pop(camera_id, None)

    def update_global(self, global_config: dict) -> dict:
        self.config["global"] = global_config
        save_config(self.config_path, self.config)
        return global_config

    def get_logs(self, camera_id: str) -> list[str]:
        instance = self.instances.get(camera_id)
        if not instance:
            raise ValueError(f"Camera {camera_id} not found")
        return list(instance.log_buffer)
