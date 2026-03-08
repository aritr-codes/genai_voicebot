import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.cache import memory_cache
from app.config import settings
from app.middleware import RequestIdFilter, RequestIdMiddleware
from app.routes import router

logger = logging.getLogger(__name__)

_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


async def _periodic_cache_cleanup():
    while True:
        await asyncio.sleep(300)
        try:
            memory_cache._cleanup_old_entries()
            logger.info("Memory cleanup completed")
        except Exception as e:
            logger.warning("Memory cleanup failed: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Setup
    _setup_logging()
    logger.info("AI Interview Voicebot starting up")
    cleanup_task = asyncio.create_task(_periodic_cache_cleanup())
    yield
    # Shutdown
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    logger.info("AI Interview Voicebot shut down")


def _setup_logging():
    root_logger = logging.getLogger()
    if not root_logger.handlers:
        logging.basicConfig(
            level=getattr(logging, settings.log_level.upper(), logging.INFO),
            format="%(asctime)s - %(name)s - %(levelname)s - [%(request_id)s] %(message)s",
        )
        if not any(isinstance(h, logging.StreamHandler) for h in root_logger.handlers):
            root_logger.addHandler(logging.StreamHandler())
    # Add request ID filter to all handlers
    rid_filter = RequestIdFilter()
    for handler in root_logger.handlers:
        handler.addFilter(rid_filter)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("assemblyai").setLevel(logging.WARNING)


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan)

    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if _STATIC_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")

    app.include_router(router)

    return app
