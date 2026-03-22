from __future__ import annotations

import base64
import hashlib
import secrets
from dataclasses import dataclass

import aiohttp
import jwt
from jwt import PyJWKSet, get_unverified_header


@dataclass
class OIDCConfig:
    issuer: str
    client_id: str
    client_secret: str


class OIDCProvider:
    def __init__(self, config: OIDCConfig):
        self.config = config
        self._discovery: dict | None = None

    async def discover(self) -> dict:
        if self._discovery:
            return self._discovery
        url = self.config.issuer.rstrip("/") + "/.well-known/openid-configuration"
        async with aiohttp.ClientSession() as s:
            async with s.get(url) as r:
                r.raise_for_status()
                self._discovery = await r.json()
        return self._discovery

    async def authorization_url(
        self, state: str, code_challenge: str, redirect_uri: str
    ) -> str:
        from urllib.parse import urlencode

        d = await self.discover()
        params = {
            "response_type": "code",
            "client_id": self.config.client_id,
            "redirect_uri": redirect_uri,
            "scope": "openid profile email",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{d['authorization_endpoint']}?{urlencode(params)}"

    async def exchange_code(
        self, code: str, code_verifier: str, redirect_uri: str
    ) -> dict:
        d = await self.discover()
        async with aiohttp.ClientSession() as s:
            async with s.post(
                d["token_endpoint"],
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": self.config.client_id,
                    "client_secret": self.config.client_secret,
                    "code_verifier": code_verifier,
                },
            ) as r:
                r.raise_for_status()
                return await r.json()

    async def validate_id_token(self, id_token: str) -> dict:
        d = await self.discover()
        async with aiohttp.ClientSession() as s:
            async with s.get(d["jwks_uri"]) as r:
                r.raise_for_status()
                jwks_data = await r.json(content_type=None)
        jwk_set = PyJWKSet.from_dict(jwks_data)
        kid = get_unverified_header(id_token).get("kid")
        try:
            signing_key = jwk_set[kid]
        except KeyError:
            raise ValueError(f"No signing key found for kid={kid!r}")
        return jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=self.config.client_id,
        )


def generate_pkce() -> tuple[str, str]:
    """Return (code_verifier, code_challenge)."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    return verifier, challenge
