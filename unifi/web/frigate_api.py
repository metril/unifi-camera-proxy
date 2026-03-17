"""Helper for authenticated Frigate HTTP API requests."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp

logger = logging.getLogger("FrigateAPI")


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
    if username and password:
        login_url = f"{base_url}/api/login"
        async with session.post(
            login_url,
            json={"user": username, "password": password},
            ssl=ssl_param,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as login_resp:
            if login_resp.status != 200:
                text = await login_resp.text()
                raise Exception(
                    f"Frigate login failed (HTTP {login_resp.status}): {text[:200]}"
                )
            logger.debug("Frigate login successful")

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
    then uses it for the actual request. If verify_ssl is False and
    an HTTPS connection fails with SSL errors, automatically retries
    with HTTP.
    """
    ssl_param = None if verify_ssl else False

    async with aiohttp.ClientSession() as session:
        try:
            return await _do_request(session, base_url, path, username, password, ssl_param, timeout)
        except (aiohttp.ClientConnectorCertificateError, aiohttp.ClientConnectorSSLError, aiohttp.ClientOSError) as e:
            # If SSL failed and URL is https, try http
            if base_url.startswith("https://"):
                http_url = "http://" + base_url[len("https://"):]
                logger.warning(
                    f"HTTPS connection failed ({e}), retrying with HTTP: {http_url}"
                )
                async with aiohttp.ClientSession() as http_session:
                    return await _do_request(http_session, http_url, path, username, password, None, timeout)
            raise Exception(
                f"SSL connection failed: {e}. "
                f"If Frigate has TLS disabled, use http:// instead of https:// in the URL."
            ) from e
