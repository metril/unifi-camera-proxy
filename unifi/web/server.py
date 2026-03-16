from __future__ import annotations

import argparse
import asyncio
import logging
import os
from pathlib import Path

import coloredlogs
from aiohttp import web

from unifi.web.camera_manager import CameraManager
from unifi.web.config import MODEL_CHOICES, get_camera_type_schemas

logger = logging.getLogger("WebServer")


def get_manager(request: web.Request) -> CameraManager:
    return request.app["manager"]


# --- API Routes ---


async def get_config(request: web.Request) -> web.Response:
    manager = get_manager(request)
    return web.json_response(manager.config)


async def update_global(request: web.Request) -> web.Response:
    manager = get_manager(request)
    data = await request.json()
    result = manager.update_global(data)
    return web.json_response(result)


async def list_cameras(request: web.Request) -> web.Response:
    manager = get_manager(request)
    return web.json_response(manager.get_all_statuses())


async def add_camera(request: web.Request) -> web.Response:
    manager = get_manager(request)
    data = await request.json()
    result = manager.add_camera(data)
    return web.json_response(result, status=201)


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
    data = await request.json()
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
    asyncio.create_task(manager.start_all_enabled())
    return web.json_response({"status": "starting"})


async def stop_all(request: web.Request) -> web.Response:
    manager = get_manager(request)
    await manager.stop_all()
    return web.json_response({"status": "stopped"})


async def get_camera_logs(request: web.Request) -> web.Response:
    manager = get_manager(request)
    camera_id = request.match_info["id"]
    try:
        logs = manager.get_logs(camera_id)
        return web.json_response({"logs": logs})
    except ValueError as e:
        return web.json_response({"error": str(e)}, status=404)


async def get_camera_types(request: web.Request) -> web.Response:
    schemas = get_camera_type_schemas()
    return web.json_response({"types": schemas, "models": MODEL_CHOICES})


async def generate_cert(request: web.Request) -> web.Response:
    """Generate a UniFi-compatible SSL certificate."""
    manager = get_manager(request)
    cert_path = manager.config.get("global", {}).get("cert", "client.pem")

    try:
        cmds = [
            ["openssl", "ecparam", "-out", "/tmp/private.key", "-name", "prime256v1", "-genkey", "-noout"],
            ["openssl", "req", "-new", "-sha256", "-key", "/tmp/private.key", "-out", "/tmp/server.csr",
             "-subj", "/C=TW/L=Taipei/O=Ubiquiti Networks Inc./OU=devint/CN=camera.ubnt.dev/emailAddress=support@ubnt.com"],
            ["openssl", "x509", "-req", "-sha256", "-days", "36500", "-in", "/tmp/server.csr",
             "-signkey", "/tmp/private.key", "-out", "/tmp/public.key"],
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
        with open("/tmp/private.key") as priv, open("/tmp/public.key") as pub:
            combined = priv.read() + pub.read()
        with open(cert_path, "w") as f:
            f.write(combined)

        # Clean up temp files
        for tmp in ["/tmp/private.key", "/tmp/public.key", "/tmp/server.csr"]:
            try:
                os.remove(tmp)
            except OSError:
                pass

        logger.info(f"Generated certificate at {cert_path}")
        return web.json_response({"status": "ok", "path": cert_path})
    except Exception as e:
        logger.error(f"Certificate generation failed: {e}")
        return web.json_response({"error": str(e)}, status=500)


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
    app = web.Application()

    manager = CameraManager(config_path)
    app["manager"] = manager

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
    app.router.add_get("/api/camera-types", get_camera_types)
    app.router.add_post("/api/generate-cert", generate_cert)

    # Static files (built frontend)
    dist = find_frontend_dist()
    if dist:
        app.router.add_static("/assets", dist / "assets")

    # Catch-all: serve index.html for SPA routing
    app.router.add_get("/{path:.*}", serve_index)

    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)

    return app


def main():
    parser = argparse.ArgumentParser(description="UniFi Cam Proxy Web UI")
    parser.add_argument(
        "--config",
        default="config.yaml",
        help="Path to config file (default: config.yaml)",
    )
    parser.add_argument(
        "--port", type=int, default=8080, help="Web server port (default: 8080)"
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Web server bind address (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Enable debug logging"
    )
    args = parser.parse_args()

    level = logging.DEBUG if args.verbose else logging.INFO
    coloredlogs.install(level=level, logger=logger)
    coloredlogs.install(level=level, logger=logging.getLogger("CameraManager"))

    app = create_app(args.config)
    logger.info(f"Starting web server on {args.host}:{args.port}")
    web.run_app(app, host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
