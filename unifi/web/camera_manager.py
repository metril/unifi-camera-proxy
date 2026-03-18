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

# Parse coloredlogs format: "TIMESTAMP HOSTNAME LOGGER[PID] LEVEL MESSAGE"
_LOG_PATTERN = re.compile(
    r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) \S+ (\w+)\[\d+\] (\w+) (.*)", re.DOTALL
)


def parse_log_line(line: str) -> dict:
    """Parse a log line into structured data."""
    m = _LOG_PATTERN.match(line)
    if m:
        return {
            "timestamp": m.group(1),
            "logger": m.group(2),
            "level": m.group(3).upper(),
            "message": m.group(4),
            "raw": line,
        }
    return {
        "timestamp": "",
        "logger": "",
        "level": "INFO",
        "message": line,
        "raw": line,
    }


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
    diagnostics_port: int = 0
    ws_clients: set = field(default_factory=set)


class CameraManager:
    _next_diag_port: int = 9100

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
        diag_port = CameraManager._next_diag_port
        CameraManager._next_diag_port += 1
        instance.diagnostics_port = diag_port
        args = config_to_args(global_config, instance.config, diagnostics_port=diag_port)

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
        logger.info(f"Log reader started for camera {instance.id}")

        async def read_stream(stream, label: str):
            try:
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    decoded = line.decode("utf-8", errors="replace").rstrip()
                    if decoded:
                        entry = parse_log_line(decoded)
                        instance.log_buffer.append(entry)
                        # Echo to web server logs so output appears in docker logs
                        logger.debug(f"[{instance.id}] {decoded}")
                        # Broadcast to WebSocket clients
                        await self.broadcast_log(instance.id, entry)
            except Exception as e:
                logger.error(f"Error reading {label} for camera {instance.id}: {e}")
            logger.debug(f"Stream {label} ended for camera {instance.id}")

        if instance.process:
            tasks = []
            if instance.process.stdout:
                tasks.append(asyncio.create_task(read_stream(instance.process.stdout, "stdout")))
            if instance.process.stderr:
                tasks.append(asyncio.create_task(read_stream(instance.process.stderr, "stderr")))
            if tasks:
                await asyncio.gather(*tasks)

            # Process has exited
            returncode = await instance.process.wait()
            if instance.status == "running":
                instance.exit_code = returncode
                # SIGTERM (-15) and SIGKILL (-9) are normal stop signals
                if returncode in (-15, -9) or returncode == 0:
                    instance.status = "stopped"
                else:
                    instance.status = "error"
                    last_entries = list(instance.log_buffer)[-5:]
                    error_detail = "\n".join(e.get("raw", str(e)) if isinstance(e, dict) else str(e) for e in last_entries) if last_entries else "No output captured"
                    instance.error_message = f"Process exited with code {returncode}: {error_detail}"
                    logger.warning(
                        f"Camera {instance.id} exited with code {returncode}. "
                        f"Last output: {error_detail}"
                    )

    async def _update_protect_device(self, instance: CameraInstance) -> None:
        """Update camera name/model in Protect after adoption."""
        global_config = self.config.get("global", {})
        host = global_config.get("host")
        username = global_config.get("nvr_username")
        password = global_config.get("nvr_password")
        if not host or not username or not password:
            return

        cam_config = instance.config
        cam_name = cam_config.get("name") or cam_config.get("frigate_camera") or ""
        cam_mac = cam_config.get("mac", "").upper().replace(":", "")
        if not cam_name or not cam_mac:
            return

        # Wait for camera to connect to Protect
        for _ in range(30):
            await asyncio.sleep(2)
            if instance.status != "running":
                return
            try:
                diag = await self.get_diagnostics(instance.id)
                if diag.get("connected"):
                    break
            except Exception:
                pass
        else:
            logger.debug(f"Camera {instance.id} did not connect within 60s, skipping Protect update")
            return

        # Give Protect a moment to register the device
        await asyncio.sleep(3)

        try:
            from uiprotect import ProtectApiClient
            protect = ProtectApiClient(
                host, 443, username, password,
                verify_ssl=False,
                store_sessions=False,
            )
            await protect.authenticate()

            # Find camera by MAC
            cameras = await protect.api_request("cameras")
            target = None
            for cam in cameras:
                if cam.get("mac", "").upper().replace(":", "") == cam_mac:
                    target = cam
                    break

            if not target:
                logger.debug(f"Camera {instance.id} (MAC {cam_mac}) not found in Protect")
                return

            # Update name if different
            protect_id = target["id"]
            updates = {}
            if target.get("name") != cam_name:
                updates["name"] = cam_name
            if updates:
                await protect.api_request(f"cameras/{protect_id}", method="patch", data=updates)
                logger.info(f"Updated Protect device {protect_id}: {updates}")

            await protect.close_session()
        except Exception as e:
            logger.debug(f"Failed to update Protect device for {instance.id}: {e}")

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
        if not camera_config.get("id"):
            camera_config["id"] = str(__import__("uuid").uuid4())[:8]
        self.config.setdefault("cameras", []).append(camera_config)
        save_config(self.config_path, self.config)
        cam_id = camera_config["id"]
        self.instances[cam_id] = CameraInstance(id=cam_id, config=camera_config)
        return camera_config

    def update_camera(self, camera_id: str, camera_config: dict) -> dict:
        """Update an existing camera's config."""
        camera_config["id"] = camera_id
        # Check if name changed for Protect API update
        old_name = None
        for cam in self.config.get("cameras", []):
            if cam.get("id") == camera_id:
                old_name = cam.get("name")
                break
        for i, cam in enumerate(self.config.get("cameras", [])):
            if cam.get("id") == camera_id:
                self.config["cameras"][i] = camera_config
                break
        else:
            raise ValueError(f"Camera {camera_id} not found in config")
        save_config(self.config_path, self.config)
        if camera_id in self.instances:
            instance = self.instances[camera_id]
            instance.config = camera_config
            # Update name in Protect if it changed and camera is running
            new_name = camera_config.get("name")
            if old_name and new_name and old_name != new_name and instance.status == "running":
                asyncio.create_task(self._update_protect_device(instance))
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

    def get_logs(self, camera_id: str) -> list:
        instance = self.instances.get(camera_id)
        if not instance:
            raise ValueError(f"Camera {camera_id} not found")
        return list(instance.log_buffer)

    async def get_diagnostics(self, camera_id: str) -> dict:
        """Query the camera subprocess's diagnostics HTTP API."""
        instance = self.instances.get(camera_id)
        if not instance:
            raise ValueError(f"Camera {camera_id} not found")
        if instance.status != "running" or not instance.diagnostics_port:
            return {"connected": False, "status": instance.status}
        try:
            import aiohttp as aiohttp_client
            async with aiohttp_client.ClientSession() as session:
                async with session.get(
                    f"http://127.0.0.1:{instance.diagnostics_port}/diagnostics",
                    timeout=aiohttp_client.ClientTimeout(total=2),
                ) as resp:
                    if resp.status == 200:
                        return await resp.json()
                    return {"connected": False, "error": f"HTTP {resp.status}"}
        except Exception as e:
            return {"connected": False, "error": str(e)}

    async def broadcast_log(self, camera_id: str, entry: dict) -> None:
        """Broadcast a log entry to all WebSocket clients for this camera."""
        instance = self.instances.get(camera_id)
        if not instance or not instance.ws_clients:
            return
        import json
        msg = json.dumps({"type": "log", "data": entry})
        dead = set()
        for ws in instance.ws_clients:
            try:
                await ws.send_str(msg)
            except Exception:
                dead.add(ws)
        instance.ws_clients -= dead
