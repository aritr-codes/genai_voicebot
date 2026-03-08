# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Interview Assistant — a voice-based browser application for practicing technical interviews. Users speak into their browser, audio is transcribed (AssemblyAI), sent to an LLM (OpenAI), and the response is converted back to speech (ElevenLabs). Optimized for Hugging Face Spaces (in-memory only, no file system persistence).

## Commands

```bash
# Install dependencies
pip install -e ".[dev]"

# Run the server (default port 7860)
python app.py

# Run tests
pytest tests/

# Run tests with coverage
pytest --cov=app tests/

# Lint
ruff check .
```

## Architecture

### Project Structure

```
app/                    # Backend package
  __init__.py           # FastAPI app factory (create_app)
  config.py             # Pydantic Settings — all config in one place
  exceptions.py         # VoicebotError hierarchy (AudioError, TranscriptionError, LLMError, TTSError, ConfigurationError)
  cache.py              # Thread-safe InMemoryCache with TTL + LRU
  audio.py              # Audio validation, numpy↔WAV conversion
  monitoring.py         # PerformanceMetrics dataclass + PerformanceMonitor
  pipeline.py           # Orchestrates: validate → transcribe → LLM → TTS
  routes.py             # FastAPI endpoints (/, /health, /process_audio)
  middleware.py         # RequestIdMiddleware, security headers, log_timing utility
  services/
    transcription.py    # AssemblyAI integration (upload + transcribe)
    llm.py              # OpenAI integration (SDK + HTTP fallback)
    tts.py              # ElevenLabs integration (MP3→WAV conversion)
static/                 # Frontend assets served at /static/
  css/styles.css
  js/app.js             # Main orchestrator (imports recorder, visualizer, wav-encoder)
  js/recorder.js        # AudioRecorder class (MediaRecorder + Web Audio API)
  js/visualizer.js      # Canvas frequency bars + waveform rendering
  js/wav-encoder.js     # WebM→WAV conversion via AudioContext
templates/
  index.html            # HTML markup only (CSS/JS loaded as static assets)
prompts/
  interview_system.txt  # LLM system prompt (externalized)
tests/                  # pytest test suite
app.py                  # Thin entry point: create_app() + uvicorn
```

### Request Flow

```
Browser (templates/index.html + static/js/*)
  → POST /process_audio (WAV file upload)
  → routes.py: asyncio.to_thread(process_audio_pipeline)
  → pipeline.py:
      validate_wav_bytes() → AudioError if invalid
      transcribe_audio_bytes() → AssemblyAI (with fallback config)
      memory_cache check → generate_llm_response() on miss
      memory_cache check → generate_tts_audio_bytes() on miss
  → Return JSON: { transcript, ai_response, audio_base64 }
```

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | Serves templates/index.html |
| GET | `/health` | Health status + performance metrics |
| POST | `/process_audio` | Main pipeline: audio → transcript → LLM → TTS |

### Key Patterns

- **Centralized config**: All settings in `app/config.py` via Pydantic `BaseSettings`. API keys use `SecretStr`. Loaded from `.env`.
- **Custom exceptions**: `VoicebotError` hierarchy maps to HTTP status codes in `routes.py` (400=AudioError, 502=API errors, 503=ConfigurationError)
- **Thread-safe cache**: `InMemoryCache` uses `threading.Lock` around all mutations
- **Async concurrency**: Pipeline runs in thread pool via `asyncio.to_thread()`. `asyncio.Semaphore` limits to `max_concurrent_requests` (default 3).
- **Lifespan management**: Cache cleanup runs as an async task (not daemon thread), enabling graceful shutdown
- **Request tracing**: `RequestIdMiddleware` assigns a 12-char hex ID per request, injected into all log messages via `RequestIdFilter`
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` added to all responses
- **Lazy API client init**: OpenAI and AssemblyAI clients created on first use in their respective service modules
- **Fallback strategies**: Transcription has primary (language detection) + fallback (English-only) configs; LLM uses SDK with HTTP API fallback

### External APIs (keys in `.env`, template in `.env.example`)

- **AssemblyAI** — speech-to-text (`app/services/transcription.py`)
- **OpenAI** — GPT response generation (`app/services/llm.py`)
- **ElevenLabs** — text-to-speech (`app/services/tts.py`)

### Frontend

Vanilla JavaScript ES modules with Web Audio API for recording and Canvas API for waveform visualization. No framework or build step. Assets served as static files from `/static/`.
