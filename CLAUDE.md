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
  pipeline.py           # process_audio_pipeline (stateless) + process_turn_pipeline (session-aware)
  prompts.py            # build_interview_prompt() + build_opening_instruction(); topic/difficulty/persona maps
  session.py            # InterviewSession dataclass + SessionStore (thread-safe, TTL-based); module singleton session_store
  routes.py             # FastAPI endpoints
  middleware.py         # RequestIdMiddleware, security headers, log_timing utility
  services/
    transcription.py    # AssemblyAI integration (upload + transcribe)
    llm.py              # OpenAI integration; generate_llm_response() (stateless) + generate_llm_response_with_history()
    tts.py              # ElevenLabs integration (MP3→WAV conversion)
static/                 # Frontend assets served at /static/
  js/app.js             # Main orchestrator (imports recorder, visualizer, wav-encoder, session, history)
  js/recorder.js        # AudioRecorder class (MediaRecorder + Web Audio API)
  js/session.js         # Frontend session state; getHistory() / saveSession() — persisted to localStorage
  js/history.js         # History screen: Canvas sparkline, stats strip, session cards
  js/visualizer.js      # Canvas frequency bars + waveform rendering
  js/wav-encoder.js     # WebM→WAV conversion via AudioContext
templates/
  index.html            # HTML markup only (CSS/JS loaded as static assets)
prompts/
  interview_system.txt  # Base LLM system prompt (extended dynamically by build_interview_prompt)
  evaluation_system.txt # System prompt for post-session evaluation (instructs LLM to return JSON)
tests/                  # pytest test suite
app.py                  # Thin entry point: create_app() + uvicorn
```

### Request Flows

**Stateless (simple mode):**
```
POST /process_audio → pipeline.process_audio_pipeline
    validate → transcribe → LLM cache check → generate_llm_response → TTS cache check → TTS
    → { transcript, ai_response, audio_base64 }
```

**Multi-turn interview session:**
```
POST /start_session  → session_store.create() → build_interview_prompt() → generate_llm_response_with_history([], opening)
                     → TTS → { session_id, question_text, question_audio_base64 }

POST /process_turn   → session_store.get(session_id) → process_turn_pipeline(session, wav_bytes)
    transcribe → append user msg to session.conversation_history
    → build_interview_prompt() → generate_llm_response_with_history(history, transcript)
    → append assistant msg → TTS (cached) → { transcript, ai_response, audio_base64, question_number, session_complete }

POST /end_session    → session_store.close() → build transcript string from conversation_history
                     → generate_llm_response_with_history(evaluation_system, [], full_transcript)
                     → parse JSON → { overall_score, summary, strengths, weaknesses, suggestions, per_question }
```

`session_complete` is `true` when `question_count` mode is active and the user has answered that many questions. Time-based mode (`question_count=None`) relies on the frontend timer.

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/` | Serves templates/index.html |
| GET | `/health` | Health status + performance metrics |
| POST | `/process_audio` | Stateless pipeline: audio → transcript → LLM → TTS |
| POST | `/start_session` | Create session, get opening question + audio |
| POST | `/process_turn` | Submit answer audio, get next question + audio |
| POST | `/end_session` | Close session, get JSON evaluation |

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
- **Session state**: Backend `SessionStore` holds `InterviewSession` objects (in-memory, 2-hour TTL). Frontend `session.js` mirrors completed sessions to `localStorage` for the history screen.
- **Dynamic prompt assembly**: `build_interview_prompt()` composes a system prompt from the base text in `prompts/interview_system.txt` plus difficulty/topic/resume/persona sections. The evaluation prompt is a separate file (`prompts/evaluation_system.txt`) — the LLM must return valid JSON.
- **LLM caching boundary**: `process_audio_pipeline` caches LLM responses (same transcript = same response). `process_turn_pipeline` never caches LLM calls (context changes each turn), but does cache TTS.

### External APIs (keys in `.env`, template in `.env.example`)

- **AssemblyAI** — speech-to-text (`app/services/transcription.py`)
- **OpenAI** — GPT response generation (`app/services/llm.py`)
- **ElevenLabs** — text-to-speech (`app/services/tts.py`)

### Frontend

Vanilla JavaScript ES modules — no framework or build step. Web Audio API for recording, Canvas API for waveform visualization and the history sparkline. Session history is stored in `localStorage` (key managed in `session.js`) and rendered by `history.js`.
