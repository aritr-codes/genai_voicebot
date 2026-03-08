import hashlib
import logging
import threading
import time
from datetime import datetime, timedelta

from app.config import settings

logger = logging.getLogger(__name__)


class InMemoryCache:
    def __init__(self):
        self.cache: dict[str, dict] = {}
        self.max_entries = settings.cache_max_entries
        self.access_times: dict[str, float] = {}
        self._lock = threading.Lock()

    def _get_cache_key(self, text: str, voice: str = "", speed: float = 1.0) -> str:
        content = f"{text.lower().strip()}_{voice}_{speed:.2f}"
        return hashlib.md5(content.encode()).hexdigest()

    def _cleanup_old_entries(self):
        with self._lock:
            if len(self.cache) <= self.max_entries:
                return
            sorted_keys = sorted(self.access_times.items(), key=lambda x: x[1])
            keys_to_remove = [key for key, _ in sorted_keys[: len(self.cache) - self.max_entries + 10]]
            for key in keys_to_remove:
                self.cache.pop(key, None)
                self.access_times.pop(key, None)

    def get(self, text: str, voice: str = "", speed: float = 1.0) -> tuple[str, bytes] | None:
        cache_key = self._get_cache_key(text, voice, speed)
        with self._lock:
            if cache_key in self.cache:
                entry = self.cache[cache_key]
                cache_time = datetime.fromisoformat(entry["timestamp"])
                if datetime.now() - cache_time < timedelta(hours=settings.cache_ttl_hours):
                    self.access_times[cache_key] = time.time()
                    logger.info("Cache hit for key: %s...", cache_key[:8])
                    return entry.get("response", ""), entry.get("audio_bytes", b"")
                else:
                    self.cache.pop(cache_key, None)
                    self.access_times.pop(cache_key, None)
        return None

    def set(self, text: str, voice: str, speed: float, response: str, audio_bytes: bytes = b""):
        cache_key = self._get_cache_key(text, voice, speed)
        with self._lock:
            self.cache[cache_key] = {
                "text": text,
                "voice": voice,
                "speed": speed,
                "response": response,
                "timestamp": datetime.now().isoformat(),
                "audio_bytes": audio_bytes,
            }
            self.access_times[cache_key] = time.time()
        self._cleanup_old_entries()
        logger.info("Cached response for key: %s...", cache_key[:8])


memory_cache = InMemoryCache()
