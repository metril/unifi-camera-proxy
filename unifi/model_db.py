"""UniFi camera model database: model name → (platform_code, sysid).

The platform code determines the firmware version string format.
The sysid is sent as the Camera-Model WebSocket header during adoption.
Data sourced from redalert11/unifi-camera-proxy CameraModelDatabase.
"""

# (platform_code, sysid_hex)
MODEL_DB: dict[str, tuple[str, int]] = {
    # Legacy
    "UVC": ("a5s", 0xA524),
    "UVC Pro": ("a5s", 0xA521),
    "UVC Dome": ("a5s", 0xA525),
    "UVC Micro": ("a5s", 0xA526),
    # G3 Series (Ambarella S2L)
    "UVC G3": ("s2l", 0xA531),
    "UVC G3 Dome": ("s2l", 0xA533),
    "UVC G3 Pro": ("s2l", 0xA532),
    "UVC G3 Flex": ("s2l", 0xA534),
    "UVC G3 Micro": ("s2lm", 0xA552),
    "UVC G3 Mini": ("sav532q", 0xA590),
    "UVC G3 Instant": ("sav532q", 0xA590),
    "UVC G3 Battery": ("s2l", 0xA531),
    # G4 Series (Ambarella S5L)
    "UVC G4 Bullet": ("s5l", 0xA572),
    "UVC G4 Pro": ("s5l", 0xA563),
    "UVC G4 PTZ": ("s5l", 0xA564),
    "UVC G4 Dome": ("s5l", 0xA573),
    "UVC G4 Doorbell": ("s5l", 0xA571),
    "UVC G4 Doorbell Pro": ("s5l", 0xA574),
    "UVC G4 Doorbell Pro PoE": ("s5l", 0xA575),
    "UVC G4 Instant": ("sav530q", 0xA595),
    # G5 Series
    "UVC G5 Bullet": ("sav530q", 0xA591),
    "UVC G5 Dome": ("sav530q", 0xA592),
    "UVC G5 Flex": ("sav530q", 0xA593),
    "UVC G5 PTZ": ("sav530q", 0xA59B),
    "UVC G5 Pro": ("sav837gw", 0xA598),
    "UVC G5 Dome Ultra": ("sav530q", 0xA59D),
    "UVC G5 Turret Ultra": ("sav530q", 0xA59C),
    # G6 Series
    "UVC G6 Bullet": ("sav539g", 0xA600),
    "UVC G6 Dome": ("sav539g", 0xA602),
    "UVC G6 Turret": ("sav539g", 0xA601),
    "UVC G6 Instant": ("sav539g", 0xA603),
    "UVC G6 PTZ": ("sav539gp", 0xA605),
    "UVC G6 Pro Bullet": ("sav539gp", 0xA607),
    "UVC G6 180": ("sav539gp", 0xA60E),
    # AI Series
    "UVC AI 360": ("cv2x", 0xA5A0),
    "UVC AI Bullet": ("cv2x", 0xA5A2),
    "UVC AI Pro": ("cv2x", 0xA5A4),
    "UVC AI THETA": ("cv2x", 0xA5A3),
    "UVC AI DSLR": ("cv22", 0xA5B0),
    # Other
    "AFi VC": ("s2lm", 0xA553),
    "Vision Pro": ("s2lm", 0xA551),
}

DEFAULT_PLATFORM = "s2l"
DEFAULT_SYSID = 0xA531
DEFAULT_FW_VERSION = "UVC.S2L.v4.23.8.67.0eba6e3.200526.1046"
# Modern firmware version template — platform code is inserted
FW_VERSION_TEMPLATE = "UVC.{platform}.v4.69.55.0.7f45c5b.241212.1510"


def get_model_info(model: str) -> tuple[str, int]:
    """Return (platform_code, sysid) for a model name."""
    return MODEL_DB.get(model, (DEFAULT_PLATFORM, DEFAULT_SYSID))


def get_firmware_version(model: str) -> str:
    """Generate the correct firmware version string for a model."""
    platform, _ = get_model_info(model)
    return FW_VERSION_TEMPLATE.format(platform=platform.upper())


def get_sysid_hex(model: str) -> str:
    """Return the sysid as a hex string (e.g., '0xa572')."""
    _, sysid = get_model_info(model)
    return hex(sysid)
