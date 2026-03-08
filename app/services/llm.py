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
