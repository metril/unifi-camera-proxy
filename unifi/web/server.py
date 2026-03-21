from __future__ import annotations

import argparse
import asyncio
import copy
import logging
import os
import secrets
import shutil
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

import aiohttp as aiohttp_client
import aiomqtt
import coloredlogs
from aiohttp import web

from uiprotect import ProtectApiClient

from unifi.web.camera_manager import CameraManager, PendingAuth
from unifi.web.config import MODEL_CHOICES, get_camera_type_schemas, inject_rtsp_credentials
from unifi.web.frigate_api import frigate_request
from unifi.web.oidc import generate_pkce

logger = logging.getLogger("WebServer")


def get_manager(request: web.Request) -> CameraManager:
    return request.app["manager"]


# --- API Routes ---


async def get_config(request: web.Request) -> web.Response:
    manager = get_manager(request)
    config = copy.deepcopy(manager.config)
    g = config.get("global", {})
    has_oidc = bool(g.get("oidc_issuer") and g.get("oidc_client_id") and g.get("oidc_client_secret"))
    g.pop("oidc_client_secret", None)
    g["has_oidc"] = has_oidc
    return web.json_response(config)


async def update_global(request: web.Request) -> web.Response:
    manager = get_manager(request)
    try:
        data = await request.json()
        result = manager.update_global(data)
        return web.json_response(result)
    except Exception as e:
        logger.exception(f"Failed to save global config: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def list_cameras(request: web.Request) -> web.Response:
    manager = get_manager(request)
    return web.json_response(manager.get_all_statuses())


VALID_CAMERA_TYPES = {
    "rtsp", "frigate", "amcrest", "dahua", "hikvision",
    "lorex", "reolink", "reolink_nvr", "tapo",
}


def _validate_camera_config(data: dict) -> list[str]:
    """Validate camera config and return list of error messages."""
    errors = []
    if not data.get("name"):
        errors.append("'name' is required")
    if not data.get("type"):
        errors.append("'type' is required")
    elif data["type"] not in VALID_CAMERA_TYPES:
        errors.append(f"'type' must be one of: {', '.join(sorted(VALID_CAMERA_TYPES))}")
    if not data.get("mac"):
        errors.append("'mac' is required")
    return errors


async def add_camera(request: web.Request) -> web.Response:
    manager = get_manager(request)
    try:
        data = await request.json()
        errors = _validate_camera_config(data)
        if errors:
            return web.json_response({"errors": errors}, status=400)
        result = manager.add_camera(data)
        return web.json_response(result, status=201)
    except Exception as e:
        logger.exception(f"Failed to add camera: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def get_camera(request: web.Request) -> web.Response:
    manager = get_manager(request)
    camera_id = request.match_info["id"]
    try:
        result = manager.get_status(camera_id)
        return web.json_response(result)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=404)


async def update_camera(request: web.Request) -> web.Response:
    manager = get_manager(request)
    camera_id = request.match_info["id"]
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)
    errors = _validate_camera_config(data)
    if errors:
        return web.json_response({"errors": errors}, status=400)
    try:
        result = manager.update_camera(camera_id, data)
        return web.json_response(result)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=404)


async def delete_camera(request: web.Request) -> web.Response:
    manager = get_manager(request)
    camera_id = request.match_info["id"]
    try:
        await manager.delete_camera(camera_id)
        return web.json_response({"status": "deleted"})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=404)


async def start_camera(request: web.Request) -> web.Response:
    manager = get_manager(request)
    camera_id = request.match_info["id"]
    try:
        await manager.start_camera(camera_id)
        return web.json_response({"status": "started"})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=404)


async def stop_camera(request: web.Request) -> web.Response:
    manager = get_manager(request)
    camera_id = request.match_info["id"]
    try:
        await manager.stop_camera(camera_id)
        return web.json_response({"status": "stopped"})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=404)


async def restart_camera(request: web.Request) -> web.Response:
    manager = get_manager(request)
    camera_id = request.match_info["id"]
    try:
        await manager.restart_camera(camera_id)
        return web.json_response({"status": "restarted"})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=404)


async def start_all(request: web.Request) -> web.Response:
    manager = get_manager(request)
    results = await manager.start_all()
    return web.json_response({"status": "completed", "cameras": results})


async def stop_all(request: web.Request) -> web.Response:
    manager = get_manager(request)
    results = await manager.stop_all()
    return web.json_response({"status": "completed", "cameras": results})


async def get_camera_logs(request: web.Request) -> web.Response:
    manager = get_manager(request)
    camera_id = request.match_info["id"]
    try:
        logs = manager.get_logs(camera_id)
        return web.json_response({"logs": logs})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=404)


async def get_camera_diagnostics(request: web.Request) -> web.Response:
    manager = get_manager(request)
    camera_id = request.match_info["id"]
    try:
        diag = await manager.get_diagnostics(camera_id)
        return web.json_response(diag)
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=404)


async def camera_snapshot(request: web.Request) -> web.Response:
    """Proxy a latest snapshot from Frigate for the given camera."""
    manager = get_manager(request)
    camera_id = request.match_info["id"]

    instance = manager.instances.get(camera_id)
    if not instance:
        return web.json_response({"error": "Camera not found"}, status=404)

    cam_config = instance.config
    global_config = manager.config.get("global", {})

    if cam_config.get("type") != "frigate":
        return web.json_response({"error": "Snapshots only available for Frigate cameras"}, status=400)

    # Resolve Frigate connection with per-camera → global fallback
    frigate_url = cam_config.get("frigate_http_url") or global_config.get("frigate_http_url")
    frigate_camera = cam_config.get("frigate_camera")
    username = cam_config.get("frigate_username") or global_config.get("frigate_username")
    password = cam_config.get("frigate_password") or global_config.get("frigate_password")
    verify_ssl = cam_config.get("frigate_verify_ssl")
    if verify_ssl is None:
        verify_ssl = global_config.get("frigate_verify_ssl", True)

    if not frigate_url or not frigate_camera:
        return web.json_response({"error": "Frigate HTTP URL and camera name are required"}, status=400)

    ssl_param = None if verify_ssl else False

    try:
        async with aiohttp_client.ClientSession() as session:
            # Authenticate if credentials provided
            if username and password:
                async with session.post(
                    f"{frigate_url}/api/login",
                    json={"user": username, "password": password},
                    ssl=ssl_param,
                    timeout=aiohttp_client.ClientTimeout(total=5),
                ) as login_resp:
                    if login_resp.status != 200:
                        return web.json_response({"error": "Frigate login failed"}, status=502)

            # Fetch snapshot
            snapshot_url = f"{frigate_url}/api/{frigate_camera}/latest.jpg?height=480&quality=75"
            async with session.get(
                snapshot_url,
                ssl=ssl_param,
                timeout=aiohttp_client.ClientTimeout(total=5),
            ) as resp:
                if resp.status != 200:
                    return web.json_response({"error": f"Frigate returned {resp.status}"}, status=502)
                data = await resp.read()
                return web.Response(
                    body=data,
                    content_type="image/jpeg",
                    headers={"Cache-Control": "no-cache, no-store"},
                )
    except Exception as e:
        logger.debug(f"Snapshot fetch failed for {camera_id}: {e}")
        return web.json_response({"error": str(e)}, status=502)


async def camera_ws(request: web.Request) -> web.WebSocketResponse:
    """WebSocket endpoint for real-time log streaming and diagnostics."""
    manager = get_manager(request)
    camera_id = request.match_info["id"]

    instance = manager.instances.get(camera_id)
    if not instance:
        return web.json_response({"error": f"Camera {camera_id} not found"}, status=404)

    ws = web.WebSocketResponse()
    await ws.prepare(request)

    # Register this client
    async with instance._ws_lock:
        instance.ws_clients.add(ws)
    logger.debug(f"WebSocket client connected for camera {camera_id}")

    try:
        # Send existing logs as initial batch
        import json
        existing = list(instance.log_buffer)
        await ws.send_str(json.dumps({"type": "logs_batch", "data": existing}))

        # Send initial diagnostics
        diag = await manager.get_diagnostics(camera_id)
        await ws.send_str(json.dumps({"type": "diagnostics", "data": diag}))

        # Stream diagnostics via WebSocket relay from subprocess (with retry)
        async def push_diagnostics():
            if not instance.diagnostics_port:
                return
            while not ws.closed:
                try:
                    async with aiohttp_client.ClientSession() as session:
                        async with session.ws_connect(
                            f"http://127.0.0.1:{instance.diagnostics_port}/diagnostics/ws"
                        ) as diag_ws:
                            async for msg in diag_ws:
                                if ws.closed:
                                    return
                                if msg.type == aiohttp_client.WSMsgType.TEXT:
                                    await ws.send_str(json.dumps({
                                        "type": "diagnostics",
                                        "data": json.loads(msg.data),
                                    }))
                except Exception:
                    if ws.closed:
                        return
                    await asyncio.sleep(2)

        diag_task = asyncio.create_task(push_diagnostics())

        # Keep connection alive, handle client messages
        async for msg in ws:
            if msg.type == web.WSMsgType.ERROR:
                break

        diag_task.cancel()
    finally:
        async with instance._ws_lock:
            instance.ws_clients.discard(ws)
        logger.debug(f"WebSocket client disconnected for camera {camera_id}")

    return ws


async def get_camera_types(request: web.Request) -> web.Response:
    schemas = get_camera_type_schemas()
    return web.json_response({"types": schemas, "models": MODEL_CHOICES})


async def fetch_token(request: web.Request) -> web.Response:
    """Fetch adoption token from UniFi Protect NVR."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid request body"}, status=400)

    host = body.get("host")
    username = body.get("username", "")
    password = body.get("password", "")

    if not host:
        return web.json_response({"error": "UniFi Protect host is required"}, status=400)
    if not username or not password:
        return web.json_response(
            {"error": "Username and password are required to fetch token (API keys cannot access this endpoint)"}, status=400
        )

    try:
        protect = ProtectApiClient(
            host, 443, username, password,
            verify_ssl=False,
            store_sessions=False,
        )
        await protect.authenticate()
        response = await protect.api_request("cameras/manage-payload")
        token = response["mgmt"]["token"]
        return web.json_response({"token": token})
    except Exception as e:
        logger.error(f"Failed to fetch token: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def test_mqtt(request: web.Request) -> web.Response:
    """Test MQTT connection and discover topics."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid request body"}, status=400)

    host = body.get("host")
    port = body.get("port", 1883)
    username = body.get("username")
    password = body.get("password")
    ssl = body.get("ssl", False)
    prefix = body.get("prefix", "frigate")

    if not host:
        return web.json_response({"error": "MQTT host is required"}, status=400)

    topics: set[str] = set()
    try:
        tls_params = aiomqtt.TLSParameters() if ssl else None
        async with aiomqtt.Client(
            host,
            port=int(port),
            username=username or None,
            password=password or None,
            tls_params=tls_params,
        ) as client:
            await client.subscribe(f"{prefix}/#")
            # Collect topics for up to 5 seconds
            try:
                async with asyncio.timeout(5):
                    async for message in client.messages:
                        topics.add(message.topic.value)
            except TimeoutError:
                pass
        return web.json_response({
            "status": "ok",
            "topics": sorted(topics),
        })
    except Exception as e:
        logger.error(f"MQTT test failed: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def test_frigate(request: web.Request) -> web.Response:
    """Test Frigate HTTP API connection and list cameras."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid request body"}, status=400)

    url = body.get("url")
    username = body.get("username")
    password = body.get("password")
    verify_ssl = body.get("verify_ssl", True)

    if not url:
        return web.json_response({"error": "Frigate HTTP URL is required"}, status=400)

    try:
        config = await frigate_request(url, "/api/config", username, password, verify_ssl=verify_ssl)
        cameras = list(config.get("cameras", {}).keys())
        return web.json_response({
            "status": "ok",
            "cameras": cameras,
            "version": config.get("version", "unknown"),
        })
    except Exception as e:
        logger.error(f"Frigate test failed: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def detect_frigate_camera(request: web.Request) -> web.Response:
    """Fetch camera settings from Frigate API for auto-population."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid request body"}, status=400)

    url = body.get("url")
    username = body.get("username")
    password = body.get("password")
    camera_name = body.get("camera_name")
    verify_ssl = body.get("verify_ssl", True)

    if not url:
        return web.json_response({"error": "Frigate HTTP URL is required"}, status=400)
    if not camera_name:
        return web.json_response({"error": "Camera name is required"}, status=400)

    try:
        config = await frigate_request(url, "/api/config", username, password, verify_ssl=verify_ssl)

        camera_config = config.get("cameras", {}).get(camera_name)
        if not camera_config:
            available = list(config.get("cameras", {}).keys())
            return web.json_response({
                "error": f"Camera '{camera_name}' not found. Available: {', '.join(available)}",
            }, status=404)

        detect = camera_config.get("detect", {})
        inputs = camera_config.get("ffmpeg", {}).get("inputs", [])

        # Rewrite localhost/internal addresses with the Frigate host
        frigate_host = urlparse(url).hostname
        streams = []
        for inp in inputs:
            path = inp.get("path", "")
            if frigate_host:
                for local in ["127.0.0.1", "localhost", "0.0.0.0"]:
                    if local in path:
                        path = path.replace(local, frigate_host)
            streams.append({
                "path": path,
                "roles": inp.get("roles", []),
            })

        # Look up go2rtc source for real camera IP
        go2rtc_sources = config.get("go2rtc", {}).get("streams", {}).get(camera_name, [])
        camera_source_url = None
        for src in go2rtc_sources:
            if isinstance(src, str) and not src.startswith("ffmpeg:"):
                camera_source_url = src
                break

        return web.json_response({
            "status": "ok",
            "camera_name": camera_name,
            "detect": {
                "width": detect.get("width", 0),
                "height": detect.get("height", 0),
                "fps": detect.get("fps", 0),
                "enabled": detect.get("enabled", False),
            },
            "streams": streams,
            "camera_source_url": camera_source_url,
            "record_enabled": camera_config.get("record", {}).get("enabled", False),
        })
    except Exception as e:
        logger.error(f"Frigate camera detection failed: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def test_rtsp(request: web.Request) -> web.Response:
    """Test RTSP stream connectivity using ffprobe."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid request body"}, status=400)

    url = body.get("url")
    transport = body.get("transport", "tcp")
    rtsp_username = body.get("username")
    rtsp_password = body.get("password")

    if not url:
        return web.json_response({"error": "RTSP URL is required"}, status=400)

    # Inject credentials if provided
    url = inject_rtsp_credentials(url, rtsp_username, rtsp_password)

    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-v", "error",
            "-rtsp_transport", transport,
            "-i", url,
            "-show_streams",
            "-of", "json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)

        if proc.returncode != 0:
            error_msg = stderr.decode().strip() or f"ffprobe exited with code {proc.returncode}"
            return web.json_response({"error": error_msg}, status=500)

        import json
        data = json.loads(stdout.decode())
        streams = []
        for s in data.get("streams", []):
            info = {"codec": s.get("codec_name", "unknown"), "type": s.get("codec_type", "unknown")}
            if s.get("width"):
                info["resolution"] = f"{s['width']}x{s['height']}"
            if s.get("r_frame_rate"):
                info["fps"] = s["r_frame_rate"]
            streams.append(info)

        return web.json_response({"status": "ok", "streams": streams})
    except asyncio.TimeoutError:
        return web.json_response({"error": "Connection timed out after 10 seconds"}, status=500)
    except Exception as e:
        logger.error(f"RTSP test failed: {e}")
        return web.json_response({"error": str(e)}, status=500)


async def generate_cert(request: web.Request) -> web.Response:
    """Generate a UniFi-compatible SSL certificate."""
    manager = get_manager(request)
    # Accept optional path from request body, fall back to saved config
    try:
        body = await request.json()
        cert_path = body.get("path") or manager.config.get("global", {}).get("cert", "/app/data/client.pem")
    except Exception:
        cert_path = manager.config.get("global", {}).get("cert", "/app/data/client.pem")

    # Validate cert_path doesn't escape working directory
    resolved = Path(cert_path).resolve()
    cwd = Path.cwd().resolve()
    if not resolved.is_relative_to(cwd):
        return web.json_response(
            {"error": f"Certificate path must be within {cwd}"}, status=400
        )

    tmpdir = tempfile.mkdtemp(prefix="unifi-cert-")
    try:
        priv_key = os.path.join(tmpdir, "private.key")
        csr_file = os.path.join(tmpdir, "server.csr")
        pub_key = os.path.join(tmpdir, "public.key")

        cmds = [
            ["openssl", "ecparam", "-out", priv_key, "-name", "prime256v1", "-genkey", "-noout"],
            ["openssl", "req", "-new", "-sha256", "-key", priv_key, "-out", csr_file,
             "-subj", "/C=TW/L=Taipei/O=Ubiquiti Networks Inc./OU=devint/CN=camera.ubnt.dev/emailAddress=support@ubnt.com"],
            ["openssl", "x509", "-req", "-sha256", "-days", "36500", "-in", csr_file,
             "-signkey", priv_key, "-out", pub_key],
        ]
        for cmd in cmds:
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await proc.communicate()
            if proc.returncode != 0:
                return web.json_response(
                    {"error": f"OpenSSL failed: {stderr.decode()}"}, status=500
                )

        # Combine private key and public cert into PEM
        with open(priv_key) as priv, open(pub_key) as pub:
            combined = priv.read() + pub.read()
        resolved.parent.mkdir(parents=True, exist_ok=True)
        with open(str(resolved), "w") as f:
            f.write(combined)

        logger.info(f"Generated certificate at {resolved}")
        return web.json_response({"status": "ok", "path": str(resolved)})
    except Exception as e:
        logger.error(f"Certificate generation failed: {e}")
        return web.json_response({"error": str(e)}, status=500)
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# --- Security Headers ---


@web.middleware
async def security_headers_middleware(request: web.Request, handler):
    response = await handler(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self' wss: ws:; "
        "font-src 'self'; "
        "frame-ancestors 'none'"
    )
    if request.secure or request.headers.get("X-Forwarded-Proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# --- Health Checks ---


async def health_check(request: web.Request) -> web.Response:
    return web.json_response({"status": "ok"})


async def readiness_check(request: web.Request) -> web.Response:
    manager: CameraManager | None = request.app.get("manager")
    if not manager:
        return web.json_response({"status": "not ready"}, status=503)
    return web.json_response({"status": "ready"})


# --- Rate Limiting ---

_rate_limit_store: dict[str, list[float]] = {}
RATE_LIMIT_MAX = 20  # requests per window
RATE_LIMIT_WINDOW = 60  # seconds


@web.middleware
async def rate_limit_middleware(request: web.Request, handler):
    if not request.path.startswith("/api/auth/"):
        return await handler(request)
    ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or request.remote or "unknown"
    now = time.time()
    timestamps = _rate_limit_store.get(ip, [])
    timestamps = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
    if len(timestamps) >= RATE_LIMIT_MAX:
        return web.json_response({"error": "rate_limited"}, status=429)
    timestamps.append(now)
    _rate_limit_store[ip] = timestamps
    return await handler(request)


# --- OIDC Auth ---


@web.middleware
async def auth_middleware(request: web.Request, handler):
    if request.path.startswith("/api/auth/") or not request.path.startswith("/api/"):
        return await handler(request)

    manager: CameraManager | None = request.app.get("manager")
    if not manager or not manager.oidc_provider:
        return await handler(request)

    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    if not token:
        token = request.rel_url.query.get("token")  # WebSocket fallback
    if token and token in manager.valid_tokens:
        if manager.valid_tokens[token] > time.time():
            return await handler(request)
        else:
            manager.valid_tokens.pop(token, None)
            return web.json_response({"error": "token_expired"}, status=401)

    return web.json_response({"error": "Unauthorized"}, status=401)


async def auth_login(request: web.Request) -> web.Response:
    manager = get_manager(request)
    provider = manager.oidc_provider
    if not provider:
        raise web.HTTPNotFound()
    now = time.time()
    manager.pending_auths = {k: v for k, v in manager.pending_auths.items() if now - v.created_at < 300}
    state = secrets.token_hex(16)
    code_verifier, code_challenge = generate_pkce()
    scheme = request.headers.get("X-Forwarded-Proto") or request.scheme
    host = request.headers.get("X-Forwarded-Host") or request.host
    redirect_uri = f"{scheme}://{host}/api/auth/callback"
    manager.pending_auths[state] = PendingAuth(code_verifier=code_verifier, redirect_uri=redirect_uri, created_at=now)
    auth_url = await provider.authorization_url(state, code_challenge, redirect_uri)
    raise web.HTTPFound(auth_url)


async def auth_callback(request: web.Request) -> web.Response:
    manager = get_manager(request)
    provider = manager.oidc_provider
    code = request.rel_url.query.get("code")
    state = request.rel_url.query.get("state")
    pending = manager.pending_auths.pop(state, None) if state else None
    if not pending or not code or not provider:
        raise web.HTTPFound("/#auth_error=invalid_state")
    try:
        tokens = await provider.exchange_code(code, pending.code_verifier, pending.redirect_uri)
        await provider.validate_id_token(tokens["id_token"])
        session_token = secrets.token_hex(32)
        manager.valid_tokens[session_token] = time.time() + 86400  # 24 hours
        raise web.HTTPFound(f"/#token={session_token}")
    except web.HTTPFound:
        raise
    except Exception as e:
        logger.exception("OIDC callback error: %s: %s", type(e).__name__, e)
        raise web.HTTPFound("/#auth_error=callback_failed")


async def auth_logout(request: web.Request) -> web.Response:
    manager = get_manager(request)
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    if token:
        manager.valid_tokens.pop(token, None)
    return web.json_response({"status": "logged_out"})


async def auth_end_session(request: web.Request) -> web.Response:
    """Invalidate session token and redirect to OIDC provider end-session."""
    from urllib.parse import urlencode
    manager = get_manager(request)
    token = request.rel_url.query.get("token")
    if token:
        manager.valid_tokens.pop(token, None)
    provider = manager.oidc_provider
    if provider:
        d = await provider.discover()
        end_session = d.get("end_session_endpoint")
        if end_session:
            scheme = request.headers.get("X-Forwarded-Proto") or request.scheme
            host = request.headers.get("X-Forwarded-Host") or request.host
            redirect_uri = f"{scheme}://{host}/"
            raise web.HTTPFound(f"{end_session}?{urlencode({'post_logout_redirect_uri': redirect_uri})}")
    raise web.HTTPFound("/")


# --- Static file serving ---


def find_frontend_dist() -> Path | None:
    """Find the built frontend dist directory."""
    # Check relative to this file
    candidates = [
        Path(__file__).parent.parent.parent / "frontend" / "dist",
        Path(__file__).parent / "static" / "dist",
    ]
    for p in candidates:
        if p.exists() and (p / "index.html").exists():
            return p
    return None


async def serve_index(request: web.Request) -> web.Response:
    dist = find_frontend_dist()
    if dist:
        return web.FileResponse(dist / "index.html")
    return web.Response(
        text="<h1>Frontend not built</h1><p>Run <code>cd frontend && npm install && npm run build</code></p>",
        content_type="text/html",
    )


# --- App factory ---


async def on_startup(app: web.Application) -> None:
    manager: CameraManager = app["manager"]
    logger.info("Starting all enabled cameras...")
    asyncio.create_task(manager.start_all_enabled())


async def on_shutdown(app: web.Application) -> None:
    manager: CameraManager = app["manager"]
    logger.info("Stopping all cameras...")
    await manager.stop_all()


def create_app(config_path: str) -> web.Application:
    app = web.Application(middlewares=[security_headers_middleware, rate_limit_middleware, auth_middleware])

    resolved_path = Path(config_path).resolve()
    logger.info(f"Config path: {resolved_path} (exists: {resolved_path.exists()})")
    logger.info(f"Working directory: {Path.cwd()}")

    manager = CameraManager(config_path)
    app["manager"] = manager

    # Health check routes (no auth required)
    app.router.add_get("/health", health_check)
    app.router.add_get("/ready", readiness_check)

    # Auth routes (must come before catch-all)
    app.router.add_get("/api/auth/login", auth_login)
    app.router.add_get("/api/auth/callback", auth_callback)
    app.router.add_post("/api/auth/logout", auth_logout)
    app.router.add_get("/api/auth/end-session", auth_end_session)

    # API routes
    app.router.add_get("/api/config", get_config)
    app.router.add_put("/api/config/global", update_global)
    app.router.add_get("/api/cameras", list_cameras)
    app.router.add_post("/api/cameras", add_camera)
    app.router.add_get("/api/cameras/start-all", start_all)
    app.router.add_get("/api/cameras/stop-all", stop_all)
    app.router.add_get("/api/cameras/{id}", get_camera)
    app.router.add_put("/api/cameras/{id}", update_camera)
    app.router.add_delete("/api/cameras/{id}", delete_camera)
    app.router.add_post("/api/cameras/{id}/start", start_camera)
    app.router.add_post("/api/cameras/{id}/stop", stop_camera)
    app.router.add_post("/api/cameras/{id}/restart", restart_camera)
    app.router.add_get("/api/cameras/{id}/logs", get_camera_logs)
    app.router.add_get("/api/cameras/{id}/diagnostics", get_camera_diagnostics)
    app.router.add_get("/api/cameras/{id}/snapshot", camera_snapshot)
    app.router.add_get("/api/cameras/{id}/ws", camera_ws)
    app.router.add_get("/api/camera-types", get_camera_types)
    app.router.add_post("/api/generate-cert", generate_cert)
    app.router.add_post("/api/fetch-token", fetch_token)
    app.router.add_post("/api/test-mqtt", test_mqtt)
    app.router.add_post("/api/test-rtsp", test_rtsp)
    app.router.add_post("/api/test-frigate", test_frigate)
    app.router.add_post("/api/detect-frigate-camera", detect_frigate_camera)

    # Static files (built frontend)
    dist = find_frontend_dist()
    if dist:
        app.router.add_static("/assets", dist / "assets")

    # Catch-all: serve index.html for SPA routing (exclude /api/ and /assets/)
    app.router.add_get("/{path:(?!api/|assets/).*}", serve_index)

    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)

    return app


def main():
    parser = argparse.ArgumentParser(description="UniFi Cam Proxy Web UI")
    parser.add_argument(
        "--config",
        default="/app/data/config.yaml",
        help="Path to config file (default: /app/data/config.yaml)",
    )
    parser.add_argument(
        "--port", type=int,
        default=int(os.environ.get("BIND_PORT", "8080")),
        help="Web server port (default: 8080, env: BIND_PORT)",
    )
    parser.add_argument(
        "--host",
        default=os.environ.get("BIND_ADDRESS", "0.0.0.0"),
        help="Web server bind address (default: 0.0.0.0, env: BIND_ADDRESS)",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable debug logging"
    )
    args = parser.parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    coloredlogs.install(level=level, logger=logger)
    coloredlogs.install(level=level, logger=logging.getLogger("CameraManager"))
    coloredlogs.install(level=level, logger=logging.getLogger("Config"))

    app = create_app(args.config)
    logger.info(f"Starting web server on {args.host}:{args.port}")
    web.run_app(app, host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
