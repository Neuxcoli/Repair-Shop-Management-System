import os

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, RedirectResponse

from ..storage import UPLOAD_DIR, is_configured

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.get("/{key:path}")
def serve_upload(key: str):
    # S3-backed: redirect to a public/signed URL.
    if is_configured():
        import boto3
        client = boto3.client("s3",
            endpoint_url=os.getenv("S3_ENDPOINT_URL"),
            region_name=os.getenv("S3_REGION", "us-east-1"),
            aws_access_key_id=os.getenv("S3_ACCESS_KEY"),
            aws_secret_access_key=os.getenv("S3_SECRET_KEY"),
        )
        url = client.generate_presigned_url(
            "get_object",
            Params={"Bucket": os.getenv("S3_BUCKET"), "Key": key},
            ExpiresIn=3600,
        )
        return RedirectResponse(url)

    # Local disk fallback.
    path = os.path.normpath(os.path.join(UPLOAD_DIR, key))
    root = os.path.normpath(UPLOAD_DIR)
    if not path.startswith(root) or not os.path.isfile(path):
        raise HTTPException(404, "Not found")
    return FileResponse(path)
