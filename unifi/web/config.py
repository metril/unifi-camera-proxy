from __future__ import annotations

import argparse
import copy
import logging
import uuid
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger("Config")

from unifi.cams import (
    DahuaCam,
    FrigateCam,
    HikvisionCam,
    Reolink,
    ReolinkNVRCam,
    RTSPCam,
    TapoCam,
)

CAMS = {
    "amcrest": DahuaCam,
    "dahua": DahuaCam,
    "frigate": FrigateCam,
    "hikvision": HikvisionCam,
    "lorex": DahuaCam,
    "reolink": Reolink,
    "reolink_nvr": ReolinkNVRCam,
    "rtsp": RTSPCam,
    "tapo": TapoCam,
}

DEFAULT_GLOBAL = {
    "host": "",
    "cert": "/app/data/client.pem",
    "token": "",
    "nvr_username": None,
    "nvr_password": None,
    "api_key": None,
    "verbose": False,
    "mqtt_host": "",
    "mqtt_port": 1883,
    "mqtt_username": None,
    "mqtt_password": None,
    "mqtt_prefix": "frigate",
    "mqtt_ssl": False,
    "rtsp_username": None,
    "rtsp_password": None,
}

MODEL_CHOICES = [
    "UVC",
    "UVC AI 360",
    "UVC AI Bullet",
    "UVC AI THETA",
    "UVC AI DSLR",
    "UVC Pro",
    "UVC Dome",
    "UVC Micro",
    "UVC G3",
    "UVC G3 Battery",
    "UVC G3 Dome",
    "UVC G3 Micro",
    "UVC G3 Mini",
    "UVC G3 Instant",
    "UVC G3 Pro",
    "UVC G3 Flex",
    "UVC G4 Bullet",
    "UVC G4 Pro",
    "UVC G4 PTZ",
    "UVC G4 Doorbell",
    "UVC G4 Doorbell Pro",
    "UVC G4 Doorbell Pro PoE",
    "UVC G4 Dome",
    "UVC G4 Instant",
    "UVC G5 Bullet",
    "UVC G5 Dome",
    "UVC G5 Flex",
    "UVC G5 Pro",
    "AFi VC",
    "Vision Pro",
]


def load_config(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        return {"global": copy.deepcopy(DEFAULT_GLOBAL), "cameras": []}
    with open(p) as f:
        data = yaml.safe_load(f) or {}
    config = {
        "global": {**copy.deepcopy(DEFAULT_GLOBAL), **(data.get("global") or {})},
        "cameras": data.get("cameras") or [],
    }
    # Ensure all cameras have an id
    for cam in config["cameras"]:
        if "id" not in cam:
            cam["id"] = str(uuid.uuid4())[:8]
    return config


def save_config(path: str, config: dict) -> None:
    resolved = Path(path).resolve()
    logger.info(f"Saving config to {resolved}")
    resolved.parent.mkdir(parents=True, exist_ok=True)
    with open(str(resolved), "w") as f:
        yaml.dump(config, f, default_flow_style=False, sort_keys=False)
    logger.info(f"Config saved successfully ({resolved.stat().st_size} bytes)")


def get_camera_type_schemas() -> dict[str, list[dict]]:
    """Introspect each camera class's add_parser() to extract parameter schemas."""
    schemas = {}
    # Only show distinct camera types (skip aliases like amcrest/lorex -> dahua)
    unique_types = {
        "rtsp": RTSPCam,
        "frigate": FrigateCam,
        "amcrest": DahuaCam,
        "dahua": DahuaCam,
        "hikvision": HikvisionCam,
        "lorex": DahuaCam,
        "reolink": Reolink,
        "reolink_nvr": ReolinkNVRCam,
        "tapo": TapoCam,
    }
    for name, klass in unique_types.items():
        parser = argparse.ArgumentParser(add_help=False)
        klass.add_parser(parser)
        fields = []
        for action in parser._actions:
            if isinstance(action, argparse._HelpAction):
                continue
            # Get the long option name (prefer -- over -)
            option_name = None
            for opt in action.option_strings:
                if opt.startswith("--"):
                    option_name = opt[2:]
                    break
            if option_name is None and action.option_strings:
                option_name = action.option_strings[0].lstrip("-")
            if option_name is None:
                continue

            field = {
                "name": option_name,
                "type": "string",
                "default": action.default,
                "required": action.required if hasattr(action, "required") else False,
                "help": action.help or "",
                "choices": action.choices if action.choices else None,
            }
            # Map argparse types to simple type names
            if action.type is int:
                field["type"] = "number"
            elif action.type is float:
                field["type"] = "number"
            elif action.type is bool:
                field["type"] = "boolean"
            elif isinstance(action, argparse._StoreTrueAction):
                field["type"] = "boolean"
                field["default"] = False
            elif action.nargs == "+":
                field["type"] = "array"

            fields.append(field)
        schemas[name] = fields
    return schemas


def inject_rtsp_credentials(url: str, username: str | None, password: str | None) -> str:
    """Inject credentials into an RTSP URL if not already present."""
    if not username or not password:
        return url
    if "@" in url.split("//", 1)[-1] if "//" in url else url:
        return url  # Already has credentials
    if "://" in url:
        scheme, rest = url.split("://", 1)
        return f"{scheme}://{username}:{password}@{rest}"
    return url


def config_to_args(global_config: dict, camera_config: dict) -> list[str]:
    """Build a CLI argument list from global + camera config."""
    args = []

    # Global args
    if global_config.get("host"):
        args.extend(["--host", str(global_config["host"])])
    if global_config.get("cert"):
        args.extend(["--cert", str(global_config["cert"])])
    if global_config.get("token"):
        args.extend(["--token", str(global_config["token"])])
    if global_config.get("nvr_username"):
        args.extend(["--nvr-username", str(global_config["nvr_username"])])
    if global_config.get("nvr_password"):
        args.extend(["--nvr-password", str(global_config["nvr_password"])])
    if global_config.get("api_key"):
        args.extend(["--api-key", str(global_config["api_key"])])
    if global_config.get("verbose"):
        args.append("--verbose")

    # Camera common args
    if camera_config.get("mac"):
        args.extend(["--mac", str(camera_config["mac"])])
    if camera_config.get("ip"):
        args.extend(["--ip", str(camera_config["ip"])])
    if camera_config.get("name"):
        args.extend(["--name", str(camera_config["name"])])
    if camera_config.get("model"):
        args.extend(["--model", str(camera_config["model"])])
    if camera_config.get("fw_version"):
        args.extend(["--fw-version", str(camera_config["fw_version"])])

    # Camera type subcommand
    cam_type = camera_config.get("type", "rtsp")
    args.append(cam_type)

    # Type-specific args: get schema for this type and map config values
    schemas = get_camera_type_schemas()
    type_fields = schemas.get(cam_type, [])
    # Fields that are already handled above or are common
    skip_fields = {
        "ffmpeg-args", "ffmpeg-base-args", "rtsp-transport",
        "timestamp-modifier", "loglevel", "format",
    }

    # Handle base class fields explicitly
    base_field_map = {
        "ffmpeg_args": "--ffmpeg-args",
        "ffmpeg_base_args": "--ffmpeg-base-args",
        "rtsp_transport": "--rtsp-transport",
        "timestamp_modifier": "--timestamp-modifier",
        "loglevel": "--loglevel",
        "format": "--format",
    }
    for config_key, cli_flag in base_field_map.items():
        val = camera_config.get(config_key)
        if val is not None:
            args.extend([cli_flag, str(val)])

    # Merge global MQTT settings for frigate cameras
    if cam_type == "frigate":
        mqtt_fields = {
            "mqtt_host": "mqtt-host",
            "mqtt_port": "mqtt-port",
            "mqtt_username": "mqtt-username",
            "mqtt_password": "mqtt-password",
            "mqtt_prefix": "mqtt-prefix",
        }
        for config_key, cli_name in mqtt_fields.items():
            # Per-camera value takes precedence over global
            val = camera_config.get(config_key)
            if val is None or val == "":
                val = global_config.get(config_key)
            if val is not None and val != "":
                args.extend([f"--{cli_name}", str(val)])
        # Handle mqtt_ssl boolean flag
        mqtt_ssl = camera_config.get("mqtt_ssl")
        if mqtt_ssl is None:
            mqtt_ssl = global_config.get("mqtt_ssl")
        if mqtt_ssl:
            args.append("--mqtt-ssl")
        skip_fields.add("mqtt-ssl")
        # Track which MQTT fields we already handled
        skip_fields.update(mqtt_fields.values())

    # Type-specific fields
    for field in type_fields:
        field_name = field["name"]
        if field_name in skip_fields:
            continue
        # Convert field name to config key (dashes to underscores)
        config_key = field_name.replace("-", "_")
        val = camera_config.get(config_key)
        if val is None or val == "" or val == field.get("default"):
            # Skip if it matches default (the CLI will use the default)
            # But always include required fields
            if not field.get("required"):
                continue
            elif val is None or val == "":
                continue
        cli_flag = f"--{field_name}"
        if field["type"] == "boolean":
            if val:
                args.append(cli_flag)
        elif field["type"] == "array":
            if isinstance(val, list):
                args.append(cli_flag)
                args.extend([str(v) for v in val])
            elif isinstance(val, str):
                args.append(cli_flag)
                args.append(val)
        else:
            args.extend([cli_flag, str(val)])

    # Inject RTSP credentials into video URLs
    rtsp_user = camera_config.get("rtsp_username") or global_config.get("rtsp_username")
    rtsp_pass = camera_config.get("rtsp_password") or global_config.get("rtsp_password")
    if rtsp_user and rtsp_pass:
        video_flags = {"--video1", "--video2", "--video3", "-s"}
        for i, arg in enumerate(args):
            if arg in video_flags and i + 1 < len(args):
                args[i + 1] = inject_rtsp_credentials(args[i + 1], rtsp_user, rtsp_pass)

    return args
