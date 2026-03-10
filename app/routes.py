import asyncio
import base64
import logging
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import HTMLResponse

from pydantic import BaseModel
from app.config import settings
from app.exceptions import VoicebotError, AudioError, ConfigurationError
from app.monitoring import perf_monitor
from app.pipeline import process_audio_pipeline
from app.session import session_store
from app.prompts import build_interview_prompt, build_opening_instruction, _TOPIC_LABELS
from app.services.llm import generate_llm_response_with_history, parse_resume
from app.services.tts import generate_tts_audio_bytes
from app.pipeline import process_turn_pipeline

logger = logging.getLogger(__name__)

router = APIRouter()

_semaphore = asyncio.Semaphore(settings.max_concurrent_requests)

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"


@router.get("/", response_class=HTMLResponse)
async def serve_index():
    index_path = _TEMPLATES_DIR / "index.html"
    return HTMLResponse(content=index_path.read_text(encoding="utf-8"))


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "configured": settings.is_configured(),
        "services": settings.config_status(),
        "llm_model": settings.openai_model,
        "tts_voice": settings.tts_voice_id,
        "metrics": perf_monitor.get_avg_times(),
    }


@router.get("/config")
async def get_config():
    """Frontend-safe config values (no secrets)."""
    return {
        "max_record_seconds": settings.max_record_seconds,
        "max_file_mb": settings.max_file_mb,
    }


@router.post("/process_audio")
async def process_audio_endpoint(audio: UploadFile = File(...)):
    if not settings.is_configured():
        raise HTTPException(status_code=503, detail="API keys not configured")

    wav_bytes = await audio.read()
    if not wav_bytes:
        raise HTTPException(status_code=400, detail="No audio data provided")

    async with _semaphore:
        try:
            transcript, tts_wav_bytes, ai_text = await asyncio.to_thread(
                process_audio_pipeline, wav_bytes
            )
        except AudioError as e:
            raise HTTPException(status_code=400, detail=e.user_message)
        except ConfigurationError as e:
            raise HTTPException(status_code=503, detail=e.user_message)
        except VoicebotError as e:
            raise HTTPException(status_code=502, detail=e.user_message)
        except Exception as e:
            logger.error("Unexpected error in process_audio: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=f"Processing failed: {e}")

    audio_base64 = base64.b64encode(tts_wav_bytes).decode("utf-8")
    return {
        "transcript": transcript,
        "ai_response": ai_text,
        "audio_base64": audio_base64,
    }


class StartSessionRequest(BaseModel):
    resume_text: str | None = None
    job_description: str | None = None
    difficulty: str = "intermediate"
    duration_minutes: int = 30
    topic: str = "general"
    persona: str = "neutral"
    question_count: int | None = None  # if set, session runs by questions not time


class EndSessionRequest(BaseModel):
    session_id: str


@router.post("/start_session")
async def start_session_endpoint(req: StartSessionRequest):
    if not settings.is_configured():
        raise HTTPException(status_code=503, detail="API keys not configured")

    session = session_store.create(
        resume_text=req.resume_text,
        job_description=req.job_description,
        difficulty=req.difficulty,
        duration_minutes=req.duration_minutes,
        topic=req.topic,
        persona=req.persona,
        question_count=req.question_count,
    )

    # Parse resume once at session start; falls back to raw text if parsing fails
    if req.resume_text:
        session.parsed_resume = await asyncio.to_thread(parse_resume, req.resume_text)

    system_prompt = build_interview_prompt(
        difficulty=session.difficulty,
        topic=session.topic,
        resume_text=session.resume_text,
        parsed_resume=session.parsed_resume,
        persona=session.persona,
        job_description=session.job_description,
    )
    opening = build_opening_instruction(session.difficulty, session.topic)

    async with _semaphore:
        try:
            first_question = await asyncio.to_thread(
                generate_llm_response_with_history,
                system_prompt,
                [],
                opening,
            )
        except VoicebotError as e:
            raise HTTPException(status_code=502, detail=e.user_message)
        except Exception as e:
            logger.error("start_session LLM error: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    session.conversation_history.append({"role": "assistant", "content": first_question})

    try:
        tts_bytes = await asyncio.to_thread(generate_tts_audio_bytes, first_question)
        audio_base64 = base64.b64encode(tts_bytes).decode()
    except Exception:
        audio_base64 = None  # TTS failure is non-fatal; frontend shows text

    return {
        "session_id": session.session_id,
        "question_text": first_question,
        "question_audio_base64": audio_base64,
    }


@router.post("/process_turn")
async def process_turn_endpoint(
    session_id: str = Form(...),
    audio: UploadFile = File(...),
):
    session = session_store.get(session_id)
    if not session or not session.is_active:
        raise HTTPException(status_code=404, detail="Session not found or already ended")

    wav_bytes = await audio.read()
    if not wav_bytes:
        raise HTTPException(status_code=400, detail="No audio data provided")

    async with _semaphore:
        try:
            transcript, tts_bytes, ai_text = await asyncio.to_thread(
                process_turn_pipeline, session, wav_bytes
            )
        except AudioError as e:
            raise HTTPException(status_code=400, detail=e.user_message)
        except ConfigurationError as e:
            raise HTTPException(status_code=503, detail=e.user_message)
        except VoicebotError as e:
            raise HTTPException(status_code=502, detail=e.user_message)
        except Exception as e:
            logger.error("process_turn error: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    user_turns = len([m for m in session.conversation_history if m["role"] == "user"])
    session_complete = (
        session.question_count is not None and user_turns >= session.question_count
    )
    return {
        "transcript": transcript,
        "ai_response": ai_text,
        "audio_base64": base64.b64encode(tts_bytes).decode(),
        "question_number": user_turns,
        "session_complete": session_complete,
    }


@router.post("/end_session")
async def end_session_endpoint(req: EndSessionRequest):
    session = session_store.get(req.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session_store.close(req.session_id)

    if not session.conversation_history:
        return {
            "overall_score": 0,
            "summary": "No answers were recorded.",
            "strengths": [],
            "weaknesses": [],
            "suggestions": ["Complete at least one question to receive feedback."],
            "per_question": [],
        }

    # Build transcript for evaluation
    transcript_lines = []
    for msg in session.conversation_history:
        role_label = "Interviewer" if msg["role"] == "assistant" else "Candidate"
        transcript_lines.append(f"{role_label}: {msg['content']}")
    full_transcript = "\n\n".join(transcript_lines)

    # Load evaluation system prompt from file
    eval_prompt_path = settings.evaluation_prompt_path
    if eval_prompt_path.exists():
        evaluation_system = eval_prompt_path.read_text(encoding="utf-8")
    else:
        logger.warning("evaluation_system.txt not found at %s — using inline fallback", eval_prompt_path)
        evaluation_system = (
            'You are an expert interview coach. Return ONLY a valid JSON object with this exact structure:\n'
            '{"overall_score": <float 1-10>, "summary": "<str>", "strengths": ["<str>"], '
            '"weaknesses": ["<str>"], "suggestions": ["<str>"], "per_question": ['
            '{"question": "<str>", "answer_summary": "<str>", "score": <int 1-10>, '
            '"feedback": "<str>", "dimensions": {"technical_accuracy": <int 1-5>, '
            '"communication": <int 1-5>, "completeness": <int 1-5>, "confidence": <int 1-5>}, '
            '"ideal_answer_hints": ["<str>"], "resume_alignment": "<Consistent|Inconsistent|N/A>"}]}'
        )

    role_label = _TOPIC_LABELS.get(session.topic, session.topic.replace("_", " ").title())
    evaluation_request = (
        f"Role: {role_label}\n\n"
        f"Here is the full interview transcript to evaluate:\n\n{full_transcript}"
    )

    async with _semaphore:
        try:
            raw = await asyncio.to_thread(
                generate_llm_response_with_history,
                evaluation_system,
                [],
                evaluation_request,
                settings.evaluation_max_tokens,
            )
        except Exception as e:
            logger.error("end_session evaluation error: %s", e, exc_info=True)
            raise HTTPException(status_code=502, detail="Could not generate evaluation")

    import json
    try:
        # Strip markdown fences if present
        cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        evaluation = json.loads(cleaned)
    except Exception as parse_err:
        logger.warning("Evaluation JSON parse failed (%s). Raw response: %.200s", parse_err, raw)
        evaluation = {
            "overall_score": 5.0,
            "summary": "Evaluation could not be parsed. Here is the raw feedback.",
            "strengths": [raw[:500]] if raw else [],
            "weaknesses": [],
            "suggestions": [],
            "per_question": [],
        }

    return evaluation
