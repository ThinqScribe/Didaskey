"""Bound incoming request bodies before multipart/JSON parsing allocates them."""
from starlette.responses import JSONResponse

MAX_UPLOAD_REQUEST_BYTES = 205 * 1024 * 1024
MAX_JSON_REQUEST_BYTES = 1024 * 1024


class RequestBodyLimit:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        is_file_upload = path.endswith("/files") or path.endswith("/attachments")
        limit = MAX_UPLOAD_REQUEST_BYTES if is_file_upload else MAX_JSON_REQUEST_BYTES
        chunks = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > limit:
                response = JSONResponse({"detail": "Request body exceeds the upload limit"}, status_code=413)
                return await response(scope, receive, send)
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        consumed = False
        async def bounded_receive():
            nonlocal consumed
            if not consumed:
                consumed = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()
        await self.app(scope, bounded_receive, send)
