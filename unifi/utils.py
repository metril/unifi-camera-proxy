"""Shared utilities for unifi-cam-proxy."""

import re


def mask_url(text: str) -> str:
    """Mask credentials in URLs and query parameters.

    Handles:
      - scheme://user:pass@host → scheme://***:***@host
      - ?password=xyz&user=abc  → ?password=***&user=***
    """
    text = re.sub(r"://[^@\s]+@", "://***:***@", text)
    text = re.sub(
        r"([?&](?:password|user|username|token)=)[^&\s]+",
        r"\1***",
        text,
        flags=re.IGNORECASE,
    )
    return text
