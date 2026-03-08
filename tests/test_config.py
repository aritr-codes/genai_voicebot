import os

import pytest


def test_settings_loads_defaults():
    """Settings should have sensible defaults even without .env."""
    from app.config import Settings

    s = Settings(
        openai_api_key="test",
        assemblyai_api_key="test",
        elevenlabs_api_key="test",
        _env_file=None,
    )
    assert s.max_record_seconds == 30
    assert s.max_file_mb == 5
    assert s.cache_ttl_hours == 24
    assert s.cache_max_entries == 100
    assert s.llm_max_tokens == 200
    assert s.llm_temperature == 0.7
    assert s.tts_sample_rate == 22050
    assert s.port == 7860
    assert s.cors_origins == ["*"]


def test_is_configured_true():
    from app.config import Settings

    s = Settings(
        openai_api_key="sk-test",
        assemblyai_api_key="aai-test",
        elevenlabs_api_key="el-test",
        _env_file=None,
    )
    assert s.is_configured() is True


def test_is_configured_false_when_missing_key():
    from app.config import Settings

    s = Settings(
        openai_api_key="sk-test",
        assemblyai_api_key="",
        elevenlabs_api_key="el-test",
        _env_file=None,
    )
    assert s.is_configured() is False


def test_config_status():
    from app.config import Settings

    s = Settings(
        openai_api_key="sk-test",
        assemblyai_api_key="",
        elevenlabs_api_key="el-test",
        _env_file=None,
    )
    status = s.config_status()
    assert status["OPENAI_API_KEY"] is True
    assert status["ASSEMBLYAI_API_KEY"] is False
    assert status["ELEVENLABS_API_KEY"] is True


def test_load_system_prompt():
    from app.config import Settings

    s = Settings(_env_file=None)
    prompt = s.load_system_prompt()
    assert "Machine Learning" in prompt
    assert "interview" in prompt.lower()
