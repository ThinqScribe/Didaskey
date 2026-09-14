from __future__ import annotations

from pathlib import PurePosixPath

from anyio import to_thread
from fastapi import HTTPException

from app.core.config import settings

MAX_FILE_BYTES = 200 * 1024 * 1024
MAX_FILE_SIZE_LABEL = "200 MB"


def storage_driver() -> str:
    return settings.FILE_STORAGE_DRIVER.strip().lower() or "database"


def build_attachment_key(*, booking_id: int, item_id: int, filename: str) -> str:
    extension = PurePosixPath(filename).suffix.lower()
    return f"learning/{booking_id}/{item_id}/attachment{extension}"


def _r2_client():
    if not all([
        settings.R2_BUCKET,
        settings.R2_ENDPOINT,
        settings.R2_ACCESS_KEY_ID,
        settings.R2_SECRET_ACCESS_KEY,
    ]):
        raise HTTPException(500, "Cloudflare R2 storage is not configured")
    try:
        import boto3
    except ModuleNotFoundError as exc:
        raise HTTPException(500, "Cloudflare R2 storage dependency is not installed") from exc
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name=settings.R2_REGION or "auto",
    )


async def store_attachment(*, key: str, content: bytes, media_type: str) -> tuple[str, bytes]:
    if storage_driver() != "r2":
        return "database", content

    def upload() -> None:
        _r2_client().put_object(
            Bucket=settings.R2_BUCKET,
            Key=key,
            Body=content,
            ContentType=media_type,
        )

    await to_thread.run_sync(upload)
    return "r2", b""


async def load_attachment(*, driver: str, storage_key: str | None, database_content: bytes | None) -> bytes:
    if storage_key and driver == "r2":
        def download() -> bytes:
            response = _r2_client().get_object(Bucket=settings.R2_BUCKET, Key=storage_key)
            return response["Body"].read()

        return await to_thread.run_sync(download)
    return database_content or b""
