"""Helper for authenticated Frigate HTTP API requests."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp

logger = logging.getLogger("FrigateAPI")


async def frigate_login(
    session: aiohttp.ClientSession,
    base_url: str,
    username: str | None,
    password: str | None,
    ssl_param: bool | None = None,
    timeout: int = 5,
) -> bool:
    """Authenticate with Frigate via POST /api/login.

    Sets a JWT session cookie on the session for subsequent requests.
    Returns True if login succeeded or no credentials were provided.
    """
    if not username or not password:
        return True
    login_url = f"{base_url}/api/login"
    async with session.post(
        login_url,
        json={"user": username, "password": password},
        ssl=ssl_param,
        timeout=aiohttp.ClientTimeout(total=timeout),
    ) as login_resp:
        if login_resp.status != 200:
            text = await login_resp.text()
            logger.warning(f"Frigate login failed (HTTP {login_resp.status}): {text[:200]}")
            return False
        logger.debug("Frigate login successful")
        return True


async def _do_request(
    session: aiohttp.ClientSession,
    base_url: str,
    path: str,
    username: str | None,
    password: str | None,
    ssl_param: bool | None,
    timeout: int,
) -> dict[str, Any]:
    """Execute login + request with given SSL setting."""
    if not await frigate_login(session, base_url, username, password, ssl_param, timeout):
        raise Exception("Frigate login failed")

    request_url = f"{base_url}{path}"
    async with session.get(
        request_url,
        ssl=ssl_param,
        timeout=aiohttp.ClientTimeout(total=timeout),
    ) as resp:
        if resp.status != 200:
            text = await resp.text()
            raise Exception(
                f"Frigate API error (HTTP {resp.status}): {text[:200]}"
            )
        return await resp.json()


async def frigate_request(
    base_url: str,
    path: str,
    username: str | None = None,
    password: str | None = None,
    verify_ssl: bool = True,
    timeout: int = 10,
) -> dict[str, Any]:
    """Make an authenticated request to the Frigate HTTP API.

    Authenticates via POST /api/login to get a JWT session cookie,
    then uses it for the actual request.
    """
    ssl_param = None if verify_ssl else False

    async with aiohttp.ClientSession() as session:
        try:
            return await _do_request(session, base_url, path, username, password, ssl_param, timeout)
        except (aiohttp.ClientConnectorCertificateError, aiohttp.ClientConnectorSSLError, aiohttp.ClientOSError) as e:
            raise Exception(
                f"SSL connection to {base_url} failed: {e}. "
                f"If Frigate does not have TLS enabled, change the URL to http:// in your camera settings."
            ) from e
