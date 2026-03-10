import json
import logging

import httpx

from app.config import settings
from app.exceptions import LLMError, ConfigurationError

logger = logging.getLogger(__name__)

_openai_client = None
_system_prompt: str | None = None


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        try:
            from openai import OpenAI
        except ImportError:
            raise ConfigurationError("openai package is not installed")
        api_key = settings.openai_api_key.get_secret_value()
        if not api_key:
            raise ConfigurationError("OPENAI_API_KEY is not set")
        _openai_client = OpenAI(
            api_key=api_key,
            timeout=settings.request_timeout_seconds,
            max_retries=2,
        )
    return _openai_client


def _get_system_prompt() -> str:
    global _system_prompt
    if _system_prompt is None:
        _system_prompt = settings.load_system_prompt()
    return _system_prompt


def generate_llm_response(user_text: str) -> str:
    system_prompt = _get_system_prompt()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_text},
    ]
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            max_tokens=settings.llm_max_tokens,
            temperature=settings.llm_temperature,
            presence_penalty=settings.llm_presence_penalty,
            frequency_penalty=settings.llm_frequency_penalty,
        )
        ai_text = (response.choices[0].message.content or "").strip()
        logger.info("LLM response generated: %d characters", len(ai_text))
        return ai_text
    except (LLMError, ConfigurationError):
        raise
    except Exception as sdk_err:
        logger.warning("SDK chat.completions failed (%s). Falling back to HTTP API...", sdk_err)
        return _generate_via_http(messages)


def _generate_via_http(messages: list[dict]) -> str:
    api_key = settings.openai_api_key.get_secret_value()
    if not api_key:
        raise ConfigurationError("OPENAI_API_KEY is not set")
    try:
        payload = {
            "model": settings.openai_model,
            "messages": messages,
            "max_tokens": settings.llm_max_tokens,
            "temperature": settings.llm_temperature,
            "presence_penalty": settings.llm_presence_penalty,
            "frequency_penalty": settings.llm_frequency_penalty,
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        r = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            json=payload,
            headers=headers,
            timeout=settings.request_timeout_seconds,
        )
        r.raise_for_status()
        data = r.json()
        ai_text = (data["choices"][0]["message"]["content"] or "").strip()
        logger.info("LLM response generated via HTTP: %d characters", len(ai_text))
        return ai_text
    except Exception as e:
        logger.error("HTTP LLM fallback failed: %s", e)
        raise LLMError(f"Failed to generate response: {e}", detail=str(e))


def generate_llm_response_with_history(
    system_prompt: str,
    conversation_history: list[dict],
    user_text: str,
    max_tokens: int | None = None,
) -> str:
    """Multi-turn variant: passes full conversation history to the LLM.

    If history exceeds ~3000 tokens (estimated), the oldest turns are dropped
    to stay within context limits (sliding window).

    Args:
        max_tokens: Override for token limit. Defaults to settings.llm_max_tokens.
    """
    api_key = settings.openai_api_key.get_secret_value()
    if not api_key:
        raise ConfigurationError("OpenAI API key not configured")

    # Rough token estimate: 1 token ≈ 4 chars
    MAX_HISTORY_CHARS = 12000
    trimmed_history = list(conversation_history)
    while trimmed_history:
        total_chars = sum(len(m.get("content", "")) for m in trimmed_history)
        if total_chars <= MAX_HISTORY_CHARS:
            break
        trimmed_history.pop(0)  # drop oldest turn

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(trimmed_history)
    messages.append({"role": "user", "content": user_text})

    client = _get_openai_client()
    try:
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=messages,
            max_tokens=max_tokens if max_tokens is not None else settings.llm_max_tokens,
            temperature=settings.llm_temperature,
            presence_penalty=settings.llm_presence_penalty,
            frequency_penalty=settings.llm_frequency_penalty,
            timeout=settings.request_timeout_seconds,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error("OpenAI multi-turn call failed: %s", e)
        raise LLMError("Failed to generate AI response", str(e))


def parse_resume(resume_text: str) -> dict | None:
    """Parse a resume into structured JSON once at session start.

    Returns a dict with keys: skills, experience, education, projects.
    Returns None on any failure — callers fall back to raw resume text.
    Requires GPT-4o-mini or later (uses json_object response_format).
    """
    if not resume_text or len(resume_text.strip()) < 50:
        return None

    system = (
        "You are a resume parser. Extract structured information from the resume text. "
        "Return ONLY a valid JSON object with exactly these keys:\n"
        '{\n'
        '  "skills": ["list of technical and soft skills mentioned"],\n'
        '  "experience": [\n'
        '    {"title": "Job Title", "company": "Company Name", "duration": "e.g. 2 years",\n'
        '     "highlights": ["key achievement or responsibility"]}\n'
        '  ],\n'
        '  "education": [{"degree": "...", "institution": "...", "year": "..."}],\n'
        '  "projects": [{"name": "...", "tech_stack": ["..."], "description": "1 sentence"}]\n'
        "}\n"
        "If a section has no data, use an empty list. Return only JSON — no markdown, no explanation."
    )

    client = _get_openai_client()
    try:
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": resume_text[:4000]},
            ],
            max_tokens=800,
            temperature=0.0,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content.strip()
        parsed = json.loads(raw)
        logger.info(
            "Resume parsed: %d skills, %d experience entries, %d projects",
            len(parsed.get("skills", [])),
            len(parsed.get("experience", [])),
            len(parsed.get("projects", [])),
        )
        return parsed
    except Exception as e:
        logger.warning("Resume parsing failed: %s", e)
        return None
