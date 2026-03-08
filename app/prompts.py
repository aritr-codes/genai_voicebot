from pathlib import Path
from app.config import settings


_DIFFICULTY_INSTRUCTIONS = {
    "beginner": (
        "Ask foundational, concept-checking questions. "
        "Focus on definitions, basic principles, and simple examples. "
        "Keep questions clear and approachable."
    ),
    "intermediate": (
        "Ask applied, scenario-based questions that require problem-solving. "
        "Expect the candidate to explain their reasoning and trade-offs. "
        "Mix technical and behavioral questions."
    ),
    "advanced": (
        "Ask challenging questions about system design, architecture, scalability, "
        "and deep technical trade-offs. Probe for nuanced understanding. "
        "Include edge cases and hypothetical scenarios."
    ),
}

_TOPIC_LABELS = {
    "general": "General Software Engineering",
    "machine_learning": "Machine Learning and AI",
    "data_engineering": "Data Engineering and Pipelines",
    "backend_development": "Backend Development and APIs",
    "system_design": "System Design and Architecture",
}

_MULTI_TURN_INSTRUCTION = (
    "\n\n**Interview Format:** You are conducting a structured multi-turn interview. "
    "Ask exactly ONE question per response. "
    "After the candidate answers, briefly acknowledge their response in 1 sentence, "
    "then ask your next question. "
    "Vary question types (technical, behavioral, situational). "
    "Do not provide long explanations or lecture — keep your turns concise."
)


def build_interview_prompt(
    difficulty: str,
    topic: str,
    resume_text: str | None = None,
) -> str:
    """Build a dynamic system prompt from the base prompt + difficulty/topic/resume context."""
    base = settings.load_system_prompt()

    sections = [base]

    difficulty_key = difficulty.lower() if difficulty.lower() in _DIFFICULTY_INSTRUCTIONS else "intermediate"
    sections.append(f"\n\n**Difficulty Level:** {_DIFFICULTY_INSTRUCTIONS[difficulty_key]}")

    topic_label = _TOPIC_LABELS.get(topic, topic.replace("_", " ").title())
    sections.append(f"\n\n**Interview Focus Area:** {topic_label}")

    if resume_text:
        truncated = resume_text[:3000]
        sections.append(
            f"\n\n**Candidate Resume (personalize questions based on this background):**\n{truncated}"
        )

    sections.append(_MULTI_TURN_INSTRUCTION)

    return "".join(sections)


def build_opening_instruction(difficulty: str, topic: str) -> str:
    """Instruction appended to the first user message to kick off the interview."""
    topic_label = _TOPIC_LABELS.get(topic, topic.replace("_", " ").title())
    return (
        f"Please begin the interview. Start with a warm welcome (1 sentence), "
        f"then ask your first {difficulty}-level {topic_label} interview question."
    )