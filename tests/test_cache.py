import threading
import time
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from app.cache import InMemoryCache


@pytest.fixture
def cache():
    return InMemoryCache()


def test_set_and_get(cache):
    cache.set("hello", "voice1", 1.0, "response text", b"audio_data")
    result = cache.get("hello", "voice1", 1.0)
    assert result is not None
    text, audio = result
    assert text == "response text"
    assert audio == b"audio_data"


def test_get_miss(cache):
    result = cache.get("nonexistent", "voice1", 1.0)
    assert result is None


def test_case_insensitive_keys(cache):
    cache.set("Hello World", "v", 1.0, "resp", b"")
    result = cache.get("hello world", "v", 1.0)
    assert result is not None


def test_different_speed_different_key(cache):
    cache.set("text", "v", 1.0, "resp1", b"a1")
    cache.set("text", "v", 1.5, "resp2", b"a2")
    r1 = cache.get("text", "v", 1.0)
    r2 = cache.get("text", "v", 1.5)
    assert r1[0] == "resp1"
    assert r2[0] == "resp2"


def test_ttl_expiration(cache):
    cache.set("text", "v", 1.0, "resp", b"audio")
    # Manually expire the entry
    for key in cache.cache:
        cache.cache[key]["timestamp"] = (datetime.now() - timedelta(hours=25)).isoformat()
    result = cache.get("text", "v", 1.0)
    assert result is None


def test_lru_eviction(cache):
    cache.max_entries = 5
    for i in range(10):
        cache.set(f"text_{i}", "v", 1.0, f"resp_{i}", b"")
    # Should have at most max_entries entries
    assert len(cache.cache) <= 5


def test_thread_safety(cache):
    """Concurrent reads and writes should not raise."""
    errors = []

    def writer(n):
        try:
            for i in range(20):
                cache.set(f"thread_{n}_{i}", "v", 1.0, f"resp_{n}_{i}", b"data")
        except Exception as e:
            errors.append(e)

    def reader(n):
        try:
            for i in range(20):
                cache.get(f"thread_{n}_{i}", "v", 1.0)
        except Exception as e:
            errors.append(e)

    threads = []
    for n in range(5):
        threads.append(threading.Thread(target=writer, args=(n,)))
        threads.append(threading.Thread(target=reader, args=(n,)))

    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == [], f"Thread safety errors: {errors}"
