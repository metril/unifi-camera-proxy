"""Helper for authenticated Frigate HTTP API requests."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp

logger = logging.getLogger("FrigateAPI")


async def frigate_request(
    base_url: str,
    path: str,
    username: str | None = None,
    password: str | None = None,
    timeout: int = 10,
) -> dict[str, Any]:
    """Make an authenticated request to the Frigate HTTP API.

    Authenticates via POST /api/login to get a JWT session cookie,
    then uses it for the actual request.
    """
    async with aiohttp.ClientSession() as session:
        # Step 1: Authenticate if credentials provided
        if username and password:
            login_url = f"{base_url}/api/login"
            async with session.post(
                login_url,
                json={"user": username, "password": password},
                ssl=False,
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as login_resp:
                if login_resp.status != 200:
                    text = await login_resp.text()
                    raise Exception(
                        f"Frigate login failed (HTTP {login_resp.status}): {text[:200]}"
                    )
                logger.debug("Frigate login successful")
                # Session cookies are automatically stored in the ClientSession

        # Step 2: Make the actual request (cookies are sent automatically)
        request_url = f"{base_url}{path}"
        async with session.get(
            request_url,
            ssl=False,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise Exception(
                    f"Frigate API error (HTTP {resp.status}): {text[:200]}"
                )
            return await resp.json()
