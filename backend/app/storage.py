import os
import re
import uuid

# S3-compatible object storage (AWS S3, Cloudflare R2, MinIO, etc.).
# Configure via environment variables:
#   S3_ENDPOINT_URL  (optional, e.g. https://<accountid>.r2.cloudflarestorage.com)
#   S3_REGION        (default us-east-1)
#   S3_ACCESS_KEY
#   S3_SECRET_KEY
#   S3_BUCKET
#   STORAGE_PUBLIC_BASE  (optional public URL prefix used to build image URLs)
#
# If credentials are absent, falls back to local disk storage under UPLOAD_DIR
# so the app still works for local/self-hosted development.

UPLOAD_DIR = os.getenv("UPLOAD_DIR", os.path.join(os.path.dirname(__file__), "..", "uploads"))
SAFE_RE = re.compile(r"[^A-Za-z0-9_.\-]+")


def _client():
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("S3_ENDPOINT_URL"),
        region_name=os.getenv("S3_REGION", "us-east-1"),
        aws_access_key_id=os.getenv("S3_ACCESS_KEY"),
        aws_secret_access_key=os.getenv("S3_SECRET_KEY"),
    )


def is_configured() -> bool:
    return bool(os.getenv("S3_ACCESS_KEY") and os.getenv("S3_SECRET_KEY") and os.getenv("S3_BUCKET"))


def build_key(order_id: int, filename: str) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        ext = ".jpg"
    safe = SAFE_RE.sub("_", os.path.splitext(filename or "")[0] or "photo")[:40]
    return f"orders/{order_id}/{uuid.uuid4().hex[:12]}_{safe}{ext}"


def store(key: str, data: bytes) -> str:
    if is_configured():
        bucket = os.getenv("S3_BUCKET")
        _client().put_object(Bucket=bucket, Key=key, Body=data)
        public_base = os.getenv("STORAGE_PUBLIC_BASE", "").rstrip("/")
        return f"{public_base}/{key}" if public_base else key
    path = os.path.join(UPLOAD_DIR, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return key


def delete(key: str) -> None:
    if is_configured():
        _client().delete_object(Bucket=os.getenv("S3_BUCKET"), Key=key)
        return
    path = os.path.join(UPLOAD_DIR, key)
    if os.path.exists(path):
        os.remove(path)
