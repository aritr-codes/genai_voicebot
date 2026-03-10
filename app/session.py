import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional


@dataclass
class InterviewSession:
    session_id: str
    resume_text: Optional[str]
    difficulty: str           # beginner, intermediate, advanced
    duration_minutes: int
    topic: str
    job_description: Optional[str] = None
    persona: str = "neutral"              # friendly, neutral, tough
    question_count: Optional[int] = None  # None = by-time mode; int = by-questions mode
    conversation_history: list = field(default_factory=list)  # list of {role, content} dicts
    covered_topics: list = field(default_factory=list)        # topic hints injected into prompt to avoid repetition
    parsed_resume: dict | None = None                         # structured resume extracted by LLM at session start
    start_time: Optional[datetime] = None
    is_active: bool = True


class SessionStore:
    def __init__(self, ttl_hours: int = 2):
        self._store: dict[str, InterviewSession] = {}
        self._lock = threading.Lock()
        self._ttl = timedelta(hours=ttl_hours)

    def create(
        self, resume_text, difficulty, duration_minutes, topic,
        persona="neutral", question_count=None, job_description=None,
    ) -> InterviewSession:
        session = InterviewSession(
            session_id=uuid.uuid4().hex,
            resume_text=resume_text,
            job_description=job_description,
            difficulty=difficulty,
            duration_minutes=duration_minutes,
            topic=topic,
            persona=persona,
            question_count=question_count,
            start_time=datetime.now(),
        )
        with self._lock:
            self._store[session.session_id] = session
        return session

    def get(self, session_id: str) -> Optional[InterviewSession]:
        with self._lock:
            return self._store.get(session_id)

    def close(self, session_id: str) -> None:
        with self._lock:
            session = self._store.get(session_id)
            if session:
                session.is_active = False

    def cleanup_expired(self) -> int:
        """Remove sessions older than TTL. Returns count removed."""
        cutoff = datetime.now() - self._ttl
        with self._lock:
            expired = [sid for sid, s in self._store.items() if s.start_time and s.start_time < cutoff]
            for sid in expired:
                del self._store[sid]
        return len(expired)


# Module-level singleton
session_store = SessionStore()