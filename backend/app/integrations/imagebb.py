"""
ImgBB image hosting integration.

Responsibility
--------------
Upload a raw image file (bytes) to ImgBB and return the permanent
display URL.  All HTTP communication is handled here; callers receive
either a URL string or a raised ``HTTPException``.

ImgBB API reference
-------------------
POST https://api.imgbb.com/1/upload
  ?key=<IMAGEBB_API_KEY>
  &name=<optional filename>
  &expiration=<optional TTL in seconds>

Multipart body:
  image — base64-encoded image data  (required)

Successful response (200):
{
  "data": {
    "url":         "https://i.ibb.co/...",   ← full-size display URL
    "display_url": "https://i.ibb.co/...",   ← same as url for direct uploads
    "thumb":       { "url": "..." },         ← 180 px thumbnail
    "delete_url":  "https://ibb.co/..."      ← one-time delete link
  },
  "success": true,
  "status":  200
}

Limits (free tier)
------------------
- Max file size : 32 MB
- Supported formats : JPEG, PNG, BMP, GIF, TIFF, WEBP, HEIC, PDF, ZIP
"""

from __future__ import annotations

import base64
import logging

import httpx
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload"

# 32 MB hard limit imposed by ImgBB
MAX_FILE_SIZE_BYTES = 32 * 1024 * 1024

# MIME types accepted by ImgBB
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/webp",
    "image/heic",
}

# ── Public API ────────────────────────────────────────────────────────────────


async def upload_image(
    image_bytes: bytes,
    *,
    filename: str = "upload",
    content_type: str = "image/jpeg",
) -> str:
    """
    Upload ``image_bytes`` to ImgBB and return the permanent display URL.

    Parameters
    ----------
    image_bytes:
        Raw binary content of the image file.
    filename:
        Suggested name stored on ImgBB (cosmetic only, no extension needed).
    content_type:
        MIME type of the image, used for client-side validation before upload.

    Returns
    -------
    str
        The permanent ``display_url`` returned by ImgBB, e.g.
        ``"https://i.ibb.co/abc123/photo.jpg"``.

    Raises
    ------
    HTTPException 400
        If the file exceeds 32 MB or the MIME type is not supported.
    HTTPException 502
        If ImgBB returns a non-200 response or the network call fails.
    HTTPException 503
        If the ``IMAGEBB_API_KEY`` setting is not configured.
    """
    # ── Guard: API key configured ─────────────────────────────────────────────
    if not settings.IMAGEBB_API_KEY:
        logger.error("IMAGEBB_API_KEY is not set in environment")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Image upload service is not configured",
        )

    # ── Guard: file size ──────────────────────────────────────────────────────
    if len(image_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Image exceeds the 32 MB size limit "
                   f"({len(image_bytes) / (1024 * 1024):.1f} MB uploaded)",
        )

    # ── Guard: MIME type ──────────────────────────────────────────────────────
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported image type '{content_type}'. "
                f"Accepted types: {', '.join(sorted(ALLOWED_CONTENT_TYPES))}"
            ),
        )

    # ── Encode and upload ─────────────────────────────────────────────────────
    encoded = base64.b64encode(image_bytes).decode("utf-8")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                IMGBB_UPLOAD_URL,
                params={"key": settings.IMAGEBB_API_KEY, "name": filename},
                data={"image": encoded},
            )
    except httpx.TimeoutException:
        logger.warning("ImgBB upload timed out for file '%s'", filename)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Image upload timed out. Please try again.",
        )
    except httpx.RequestError as exc:
        logger.error("ImgBB network error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Image upload service is unreachable. Please try again.",
        )

    # ── Parse response ────────────────────────────────────────────────────────
    if response.status_code != 200:
        logger.error(
            "ImgBB returned %s: %s", response.status_code, response.text[:200]
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Image upload failed (ImgBB status {response.status_code})",
        )

    body = response.json()
    if not body.get("success"):
        logger.error("ImgBB success=false: %s", body)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Image upload was rejected by the hosting service",
        )

    display_url: str = body["data"]["display_url"]
    logger.info("ImgBB upload succeeded: %s", display_url)
    return display_url
