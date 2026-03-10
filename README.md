# AI Interview Assistant

A voice-based AI interview practice platform. Speak your answers into the browser, get real-time AI feedback, and track your progress over time — no sign-up required.

**Powered by:** OpenAI · AssemblyAI · ElevenLabs
**Designed for:** Local use and Hugging Face Spaces (in-memory, no persistent storage)

---

## Features

### Interview Practice
- **Multi-turn sessions** — Full interview flow across multiple Q&A rounds, not just one-shot Q&A
- **Resume upload** — Drag-and-drop PDF or TXT; questions are personalized to your background (client-side PDF parsing via pdf.js)
- **13 topics across 7 groups** — Backend, Frontend, Full Stack, Mobile, ML/AI, Data Engineering, System Design, Product Management, DevOps/Cloud, Digital Marketing, SEO/Content, Performance Marketing, Behavioral (STAR)
- **3 difficulty levels** — Beginner (foundational), Intermediate (applied), Advanced (system design & depth)
- **2 session modes** — By Time (15/30/45 min countdown) or By Questions (5/10/15/custom, elapsed timer)
- **3 interviewer personas** — Friendly, Neutral, Tough (affects follow-up style and pushback intensity)
- **Natural conversation** — AI probes vague answers, pushes back on gaps, advances on solid answers

### Feedback & Evaluation
- **Overall score** — Animated circular score out of 10 with a one-line summary
- **Strengths & areas to improve** — Bulleted, session-specific observations
- **Actionable suggestions** — Numbered improvement recommendations
- **Per-question breakdown** — Accordion with score, answer summary, feedback, and dimension bars (Technical Accuracy, Communication, Completeness, Confidence)
- **Ideal answer hints** — Key points the ideal answer would have included
- **Resume alignment** — Consistent / Inconsistent / N/A badge per question
- **Speaking metrics** — Filler word count, avg words per answer, longest/shortest answer (computed client-side from transcripts)

### Progression Tracking
- **History screen** — Accessible from any screen via the 📊 icon
- **Score trend sparkline** — Canvas chart of last 10 sessions, filterable by topic
- **Stats strip** — Total sessions, average score, best topic, current practice streak
- **Session cards** — Chronological list with date, topic, difficulty, question count, score
- **Stored in localStorage** — No backend required, max 50 sessions (FIFO eviction)

### UI/UX
- **Three-screen flow** — Setup → Interview → Results, with slide-in transitions
- **Dark / light theme** — Toggle persisted to localStorage
- **Audio visualizer** — Frequency bars (rounded tops + glow) during recording; idle pulsing sine wave between questions
- **Recording pulse ring** — Animated red glow on the stop button during recording
- **Loading skeletons** — Shimmer placeholder CSS class for in-flight states
- **Animated score reveal** — `requestAnimationFrame` cubic ease-out on results load
- **Per-question stagger** — 80 ms delay per accordion item on results reveal

---

## Three-Screen Flow

```
┌─────────────┐     ┌──────────────────────┐     ┌───────────────┐
│  SETUP      │────▶│  INTERVIEW           │────▶│  RESULTS      │
│             │     │                      │     │               │
│ • Resume    │     │ • Timer (MM:SS)      │     │ • Score /10   │
│ • Difficulty│     │ • Question counter   │     │ • Strengths   │
│ • Duration  │     │ • Record answer      │     │ • Weaknesses  │
│ • Persona   │     │ • AI feedback        │     │ • Suggestions │
│ • Topic     │     │ • Next / End / Skip  │     │ • Per-Q detail│
│             │     │ • Conversation log   │     │ • Metrics     │
│ [Start] ───▶│     │                      │     │               │
└─────────────┘     └──────────────────────┘     └───────────────┘
                                                        │
                                               [View History] ──▶ 📊 History Screen
                                               [Practice Again]
                                               [Try Same Setup]
```

---

## Project Structure

```
genai_voicebot/
├── app/                          # Backend package
│   ├── __init__.py               # FastAPI app factory, lifespan, logging setup
│   ├── config.py                 # Pydantic Settings (all config centralized)
│   ├── exceptions.py             # VoicebotError hierarchy
│   ├── cache.py                  # Thread-safe InMemoryCache (TTL + LRU)
│   ├── audio.py                  # Audio validation, numpy ↔ WAV conversion
│   ├── monitoring.py             # PerformanceMetrics + PerformanceMonitor
│   ├── pipeline.py               # process_audio_pipeline + process_turn_pipeline
│   ├── routes.py                 # All API endpoints
│   ├── session.py                # InterviewSession dataclass + thread-safe SessionStore
│   ├── prompts.py                # Dynamic prompt builder (difficulty/topic/persona/resume)
│   ├── middleware.py             # Request ID, security headers, log_timing
│   └── services/
│       ├── transcription.py      # AssemblyAI integration
│       ├── llm.py                # OpenAI (SDK + HTTP fallback, single-turn + history)
│       └── tts.py                # ElevenLabs (MP3 → WAV)
├── static/
│   ├── css/styles.css            # All styles (themes, animations, history screen)
│   └── js/
│       ├── app.js                # Main orchestrator — event wiring, screen logic
│       ├── session.js            # Session state, API calls, localStorage history
│       ├── timer.js              # Timer class (countdown + elapsed modes)
│       ├── history.js            # History screen renderer + Canvas sparkline
│       ├── recorder.js           # AudioRecorder (MediaRecorder + Web Audio API)
│       ├── visualizer.js         # Frequency bars, idle sine wave, waveform
│       └── wav-encoder.js        # WebM → WAV conversion via AudioContext
├── templates/
│   └── index.html                # Four-screen SPA markup
├── prompts/
│   ├── interview_system.txt      # Base LLM system prompt
│   └── evaluation_system.txt     # Evaluation LLM prompt (returns structured JSON)
├── tests/
│   ├── conftest.py
│   ├── test_config.py
│   ├── test_cache.py
│   ├── test_audio.py
│   ├── test_pipeline.py
│   └── test_routes.py
├── app.py                        # Thin entry point
├── pyproject.toml                # Dependencies + tool config
├── requirements.txt              # Flat install list (for HF Spaces)
├── .env.example                  # API key template
└── CLAUDE.md                     # AI coding assistant context
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serves the interview UI |
| `GET` | `/health` | Health check + performance metrics |
| `POST` | `/process_audio` | Legacy single-turn pipeline (backward compatible) |
| `POST` | `/start_session` | Create session, return first question + audio |
| `POST` | `/process_turn` | Submit answer audio, get AI response + next question |
| `POST` | `/end_session` | End session, trigger LLM evaluation, return full report |

### `POST /start_session`

**Request (JSON):**
```json
{
  "resume_text": "Optional resume content…",
  "difficulty": "intermediate",
  "duration_minutes": 30,
  "topic": "backend_engineering",
  "persona": "neutral",
  "question_count": null
}
```
`question_count` non-null activates by-questions mode.

**Response:**
```json
{
  "session_id": "abc123",
  "question_text": "Tell me about yourself…",
  "question_audio_base64": "UklGR…"
}
```

### `POST /process_turn`

**Request:** `multipart/form-data` — `session_id` (text) + `audio` (WAV file)

**Response:**
```json
{
  "transcript": "I would use Redis for…",
  "ai_response": "Good point. Can you walk me through…",
  "audio_base64": "UklGR…",
  "question_number": 2,
  "session_complete": false
}
```

### `POST /end_session`

**Request:** `{ "session_id": "abc123" }`

**Response:**
```json
{
  "overall_score": 7.5,
  "summary": "Strong performance with clear communication.",
  "strengths": ["…"],
  "weaknesses": ["…"],
  "suggestions": ["…"],
  "per_question": [
    {
      "question": "…",
      "answer_summary": "…",
      "score": 8,
      "feedback": "…",
      "dimensions": {
        "technical_accuracy": 4,
        "communication": 4,
        "completeness": 3,
        "confidence": 4
      },
      "ideal_answer_hints": ["…"],
      "resume_alignment": "Consistent"
    }
  ]
}
```

**Error mapping:**

| Exception | HTTP Status | Meaning |
|-----------|-------------|---------|
| `AudioError` | 400 | Invalid/empty/silent audio |
| `TranscriptionError` | 502 | AssemblyAI failure |
| `LLMError` | 502 | OpenAI failure |
| `TTSError` | 502 | ElevenLabs failure |
| `ConfigurationError` | 503 | Missing API keys |

---

## Prerequisites

- Python 3.11+
- API keys for [OpenAI](https://platform.openai.com/), [AssemblyAI](https://www.assemblyai.com/), [ElevenLabs](https://elevenlabs.io/)

## Installation

```bash
git clone https://github.com/yourusername/genai-voicebot.git
cd genai-voicebot

# Install with dev tools
pip install -e ".[dev]"

# Or simple install (for HF Spaces)
pip install -r requirements.txt

# Configure API keys
cp .env.example .env
# Edit .env with your keys
```

## Running

```bash
python app.py          # Starts on http://localhost:7860
```

Open `http://localhost:7860`, configure your interview, and click **Start Interview**.

## Development

```bash
pytest tests/              # Run tests
pytest --cov=app tests/    # With coverage
ruff check .               # Lint
```

---

## Configuration

All settings are in `app/config.py` via Pydantic Settings, loaded from `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | OpenAI API key (required) |
| `ASSEMBLYAI_API_KEY` | — | AssemblyAI API key (required) |
| `ELEVENLABS_API_KEY` | — | ElevenLabs API key (required) |
| `OPENAI_MODEL` | `gpt-3.5-turbo` | GPT model to use |
| `LLM_MAX_TOKENS` | `200` | Max tokens per interview response |
| `LLM_TEMPERATURE` | `0.7` | LLM sampling temperature |
| `TTS_VOICE_ID` | `3gsg3cxXyFLcGIfNbM6C` | ElevenLabs voice ID |
| `MAX_CONCURRENT_REQUESTS` | `3` | Semaphore limit |
| `CACHE_TTL_HOURS` | `24` | Cache entry lifetime |
| `CACHE_MAX_ENTRIES` | `100` | Max cached items (LRU eviction) |
| `PORT` | `7860` | Server port |
| `LOG_LEVEL` | `INFO` | Logging level |

Session TTL is 2 hours. Sessions older than that are pruned by the lifespan background task.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web framework | FastAPI + Uvicorn |
| Configuration | Pydantic Settings |
| Speech-to-text | AssemblyAI |
| LLM | OpenAI GPT |
| Text-to-speech | ElevenLabs |
| Audio processing | NumPy, SciPy, soundfile, pydub |
| Frontend | Vanilla JS (ES modules), Web Audio API, Canvas API |
| PDF parsing | pdf.js (CDN, client-side) |
| Persistence | localStorage only (history, theme preference) |
| Testing | pytest, pytest-asyncio, pytest-cov |
| Linting | Ruff |

## Browser Support

Chrome/Edge (recommended), Firefox, Safari (limited audio format support). Requires MediaRecorder API, Web Audio API, and Canvas API.

## Limitations

- Max recording: 30 seconds per answer
- In-memory sessions only — cleared on server restart
- History stored in browser localStorage — not shared across devices
- Requires internet connection for all three external APIs
- No user authentication (designed as a personal practice tool)

---

## License

MIT License

## Acknowledgments

- [OpenAI](https://openai.com/) — GPT models
- [AssemblyAI](https://www.assemblyai.com/) — Speech recognition
- [ElevenLabs](https://elevenlabs.io/) — Text-to-speech
- [FastAPI](https://fastapi.tiangolo.com/) — Web framework
- [pdf.js](https://mozilla.github.io/pdf.js/) — Client-side PDF parsing
