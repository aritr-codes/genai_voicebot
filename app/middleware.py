import contextvars
import logging
import time
import uuid
from contextlib import contextmanager

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="")

logger = logging.getLogger(__name__)

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assigns a unique request ID, adds security headers, and logs timing."""

    async def dispatch(self, request: Request, call_next):
        rid = uuid.uuid4().hex[:12]
        request_id_var.set(rid)
        start = time.perf_counter()

        logger.info("[%s] %s %s", rid, request.method, request.url.path)
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000

        logger.info("[%s] %s %s -> %d (%.0fms)", rid, request.method, request.url.path, response.status_code, elapsed_ms)
        response.headers["X-Request-ID"] = rid
        for header, value in SECURITY_HEADERS.items():
            response.headers[header] = value
        return response


class RequestIdFilter(logging.Filter):
    """Logging filter that injects request_id into log records."""

    def filter(self, record):
        record.request_id = request_id_var.get("")
        return True


@contextmanager
def log_timing(operation: str):
    """Context manager that logs the duration of an operation."""
    start = time.perf_counter()
    yield
    elapsed = (time.perf_counter() - start) * 1000
    logger.info("%s completed in %.0fms", operation, elapsed)
