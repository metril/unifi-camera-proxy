"""Saved multi-camera layouts that render in any browser/TV/kiosk.

A Live View is a pure frontend dashboard: a canvas (px) with tiles, each
positioned absolutely and pointing at an existing camera by id. The player
pulls each tile's live video through the existing HLS / MSE pipeline — no
ffmpeg compositing, no virtual UVC camera, no Protect adoption. The
operator pulls up ``/live/<id>?token=<kiosk-token>`` on any display to
show that layout fullscreen.

This module owns the data shape + validation + kiosk-token mint/revoke.
The HTTP layer lives in ``unifi/web/server.py``.
"""

from __future__ import annotations

import secrets
import uuid
from typing import Any


def new_live_view_id() -> str:
    """Short, URL-safe id matching the camera id length convention."""
    return str(uuid.uuid4())[:8]


def mint_kiosk_token() -> str:
    """Generate a kiosk-display token. 32 bytes ≈ 256 bits of entropy."""
    return secrets.token_urlsafe(32)


def validate_live_view(data: dict, cameras: list[dict]) -> list[str]:
    """Return a list of error messages for an invalid Live View payload.

    Used by both POST /api/live-views and PUT /api/live-views/{id} to keep
    bad shapes out of the YAML.
    """
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["payload must be an object"]
    if not data.get("name") or not isinstance(data["name"], str):
        errors.append("'name' is required")

    canvas = data.get("canvas") or {}
    try:
        cw = int(canvas.get("w", 0))
        ch = int(canvas.get("h", 0))
    except (TypeError, ValueError):
        cw = ch = 0
    if cw <= 0 or ch <= 0:
        errors.append("'canvas.w' and 'canvas.h' must be positive integers")

    tiles = data.get("tiles") or []
    if not isinstance(tiles, list) or len(tiles) == 0:
        errors.append("'tiles' must be a non-empty list")
        return errors

    known_ids = {c.get("id") for c in cameras if c.get("id")}
    for i, tile in enumerate(tiles, 1):
        if not isinstance(tile, dict):
            errors.append(f"tile {i}: must be an object")
            continue
        cam_id = tile.get("camera_id")
        if not cam_id or cam_id not in known_ids:
            errors.append(f"tile {i}: camera_id '{cam_id}' is not a known camera")
        try:
            x = int(tile.get("x", 0))
            y = int(tile.get("y", 0))
            w = int(tile.get("w", 0))
            h = int(tile.get("h", 0))
        except (TypeError, ValueError):
            errors.append(f"tile {i}: x/y/w/h must be integers")
            continue
        if w <= 0 or h <= 0:
            errors.append(f"tile {i}: w and h must be positive")
        if cw > 0 and ch > 0 and (x < 0 or y < 0 or x + w > cw or y + h > ch):
            errors.append(
                f"tile {i}: extends outside the {cw}×{ch} canvas "
                f"(at {x},{y} sized {w}×{h})"
            )
    return errors


def normalize_live_view(data: dict, existing_id: str | None = None) -> dict:
    """Strip the payload down to the fields we persist, in a stable shape.

    Callers should run ``validate_live_view`` first; this assumes the input
    is well-formed. ``existing_id`` is used for PUT to preserve the id; for
    POST pass ``None`` and one is minted.
    """
    canvas = data.get("canvas") or {}
    tiles = data.get("tiles") or []
    return {
        "id": existing_id or new_live_view_id(),
        "name": str(data["name"]),
        "canvas": {"w": int(canvas["w"]), "h": int(canvas["h"])},
        "tiles": [
            {
                "camera_id": str(t["camera_id"]),
                "x": int(t.get("x", 0)),
                "y": int(t.get("y", 0)),
                "w": int(t["w"]),
                "h": int(t["h"]),
            }
            for t in tiles
        ],
        # Preserve any existing kiosk_token; mint/revoke happens via the
        # dedicated endpoint, not via the update payload.
        "kiosk_token": data.get("kiosk_token"),
    }


def find_live_view(config: dict, view_id: str) -> dict[str, Any] | None:
    """Look up a Live View by id in the loaded app config."""
    for v in config.get("live_views") or []:
        if v.get("id") == view_id:
            return v
    return None
