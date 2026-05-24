import argparse
import asyncio
import logging
import sys
from shutil import which

import coloredlogs
from uiprotect import ProtectApiClient

from unifi.cams import (
    DahuaCam,
    FrigateCam,
    HikvisionCam,
    Reolink,
    ReolinkNVRCam,
    RTSPCam,
    TapoCam,
)
from unifi.core import Core
from unifi.version import __version__

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


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", action="version", version=__version__)
    parser.add_argument("--host", "-H", required=True, help="NVR ip address and port")
    parser.add_argument("--nvr-username", required=False, help="NVR username")
    parser.add_argument("--nvr-password", required=False, help="NVR password")
    parser.add_argument(
        "--api-key", required=False, default=None, help="UniFi Protect API key"
    )
    parser.add_argument(
        "--cert",
        "-c",
        required=True,
        default="client.pem",
        help="Client certificate path",
    )
    parser.add_argument(
        "--token", "-t", required=False, default=None, help="Adoption token"
    )
    parser.add_argument("--mac", "-m", default="AABBCCDDEEFF", help="MAC address")
    parser.add_argument(
        "--ip",
        "-i",
        default="192.168.1.10",
        help="IP address of camera (only used to display in UI and to connect Tapo/hikvision Cameras)",
    )
    parser.add_argument(
        "--name",
        "-n",
        default="unifi-camera-proxy",
        help="Name of camera (only works for UFV)",
    )
    parser.add_argument(
        "--model",
        default="UVC G4 Bullet",
        choices=[
            "UVC G6 Bullet",
            "UVC G6 Dome",
            "UVC G6 Turret",
            "UVC G6 Instant",
            "UVC G6 PTZ",
            "UVC G6 Pro Bullet",
            "UVC G6 180",
            "UVC AI 360",
            "UVC AI Bullet",
            "UVC AI Pro",
            "UVC AI THETA",
            "UVC AI DSLR",
            "UVC G5 Bullet",
            "UVC G5 Dome",
            "UVC G5 Dome Ultra",
            "UVC G5 Turret Ultra",
            "UVC G5 Flex",
            "UVC G5 Pro",
            "UVC G5 PTZ",
            "UVC G4 Bullet",
            "UVC G4 Pro",
            "UVC G4 PTZ",
            "UVC G4 Doorbell",
            "UVC G4 Doorbell Pro",
            "UVC G4 Doorbell Pro PoE",
            "UVC G4 Dome",
            "UVC G4 Instant",
            "UVC G3",
            "UVC G3 Battery",
            "UVC G3 Dome",
            "UVC G3 Micro",
            "UVC G3 Mini",
            "UVC G3 Instant",
            "UVC G3 Pro",
            "UVC G3 Flex",
            "UVC",
            "UVC Pro",
            "UVC Dome",
            "UVC Micro",
            "AFi VC",
            "Vision Pro",
        ],
        help="Hardware model to identify as",
    )
    parser.add_argument(
        "--fw-version",
        "-f",
        default=None,
        help=(
            "Firmware version to initiate connection with. Defaults to a "
            "model-aware modern UVC build via model_db.get_firmware_version "
            "(e.g. UVC.S5L.v4.69... for a G4 Bullet), which keeps Protect "
            "from immediately pushing an upgrade after adoption."
        ),
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="increase output verbosity"
    )

    sp = parser.add_subparsers(
        help="Camera implementations",
        dest="impl",
        required=True,
    )
    for name, impl in CAMS.items():
        subparser = sp.add_parser(name)
        impl.add_parser(subparser)
    return parser.parse_args()


async def generate_token(args, logger):
    try:
        protect = ProtectApiClient(
            args.host,
            443,
            args.nvr_username,
            args.nvr_password,
            api_key=getattr(args, "api_key", None),
            verify_ssl=False,
            store_sessions=False,
        )
        await protect.authenticate()
        response = await protect.api_request("cameras/manage-payload")
        return response["mgmt"]["token"]
    except Exception:
        logger.exception(
            "Could not automatically fetch token, please see docs at"
            " https://unifi-camera-proxy.com/"
        )
        return None
    finally:
        await protect.close_session()


async def run():
    args = parse_args()
    klass = CAMS[args.impl]

    core_logger = logging.getLogger("Core")
    class_logger = logging.getLogger(klass.__name__)

    level = logging.INFO
    if args.verbose:
        level = logging.DEBUG

    for logger in [core_logger, class_logger]:
        coloredlogs.install(level=level, logger=logger)

    # Preflight checks
    for binary in ["ffmpeg", "nc"]:
        if which(binary) is None:
            logger.error(f"{binary} is not installed")
            sys.exit(1)

    if not args.token:
        args.token = await generate_token(args, logger)

    if not args.token:
        logger.error("A valid token is required")
        sys.exit(1)

    # Resolve model-aware defaults from model_db. fw_version is derived from
    # the camera's platform code (e.g. UVC.S5L.v4.69... for a G4 Bullet) so
    # Protect's firmware-version check doesn't immediately demand an upgrade.
    # sysid is sent on the Camera-Model WS handshake header for Protect's
    # device identification.
    from unifi.model_db import get_firmware_version, get_sysid_hex

    if not args.fw_version:
        args.fw_version = get_firmware_version(args.model)
    args.sysid = get_sysid_hex(args.model)

    cam = klass(args, logger)
    c = Core(args, cam, core_logger)
    await c.run()


def main():
    loop = asyncio.get_event_loop()
    loop.run_until_complete(run())


if __name__ == "__main__":
    main()
