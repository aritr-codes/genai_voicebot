from app.config import settings


_ROLE_PROMPTS = {
    # Engineering
    "backend_engineering": (
        "Focus on backend concepts: REST/gRPC API design, database modeling, SQL vs NoSQL, "
        "caching strategies (Redis, CDN), message queues (Kafka, RabbitMQ), authentication/authorization, "
        "microservices vs monolith, containerisation (Docker/Kubernetes), and service reliability."
    ),
    "frontend_engineering": (
        "Focus on frontend concepts: component architecture (React/Vue/Angular), state management, "
        "rendering strategies (SSR/CSR/ISR), performance (Core Web Vitals, lazy loading, code splitting), "
        "accessibility (WCAG), CSS architecture, browser APIs, and frontend testing strategies."
    ),
    "full_stack": (
        "Cover both frontend and backend: API integration, full-stack data flow, authentication end-to-end, "
        "deployment pipelines (CI/CD), database choices, UI/UX considerations, and trade-offs between "
        "client-side and server-side logic."
    ),
    "mobile": (
        "Focus on mobile development: native vs cross-platform trade-offs (React Native/Flutter/Swift/Kotlin), "
        "mobile performance optimisation, offline-first patterns, push notifications, app store deployment, "
        "battery/memory constraints, and mobile security."
    ),
    # Data & AI
    "machine_learning": (
        "Focus on ML/AI concepts: model selection, feature engineering, bias-variance trade-off, "
        "overfitting/regularisation, evaluation metrics (precision/recall/AUC), ML pipelines, "
        "MLOps, model deployment, LLMs and fine-tuning, and ethical AI considerations."
    ),
    "data_engineering": (
        "Focus on data engineering: ETL/ELT pipeline design, data warehousing (Snowflake/BigQuery/Redshift), "
        "batch vs streaming (Spark/Flink/Kafka), data modelling (star/snowflake schema), "
        "data quality, orchestration (Airflow/dbt), and data governance."
    ),
    # Architecture
    "system_design": (
        "Focus on system design: scalability (horizontal/vertical scaling), load balancing, CAP theorem, "
        "consistency patterns, distributed systems, database sharding and replication, "
        "event-driven architecture, rate limiting, CDN design, and designing real-world systems "
        "(URL shortener, social feed, ride-sharing, etc.)."
    ),
    # Product
    "product_management": (
        "Focus on product management: defining user problems, writing PRDs, prioritisation frameworks "
        "(RICE, MoSCoW, Kano), product metrics and KPIs, A/B testing, roadmap planning, "
        "stakeholder communication, go-to-market strategy, and working with engineering and design."
    ),
    # Operations
    "devops_cloud": (
        "Focus on DevOps/Cloud: CI/CD pipelines (GitHub Actions, Jenkins), infrastructure-as-code "
        "(Terraform, Ansible), container orchestration (Kubernetes), cloud platforms (AWS/GCP/Azure), "
        "monitoring/alerting (Prometheus, Grafana), incident management (SLO/SLA/SLI), and security posture."
    ),
    # Marketing
    "digital_marketing": (
        "Focus on digital marketing: multi-channel campaign strategy, audience segmentation and targeting, "
        "content marketing, social media strategy, email marketing automation, attribution modelling, "
        "brand positioning, and data-driven decision-making. Evaluate strategic thinking and business impact "
        "over technical accuracy."
    ),
    "seo_content": (
        "Focus on SEO and content strategy: keyword research and intent mapping, on-page/off-page SEO, "
        "technical SEO (Core Web Vitals, crawlability, structured data), content calendar planning, "
        "editorial workflows, content repurposing, and measuring organic growth. "
        "Evaluate strategic thinking and business impact over technical accuracy."
    ),
    "performance_marketing": (
        "Focus on paid advertising: SEM (Google Ads, Bing), paid social (Meta, LinkedIn, TikTok), "
        "bid strategies and budget allocation, creative testing, conversion optimisation (CRO), "
        "ROAS/CAC/LTV metrics, attribution models, and scaling campaigns profitably. "
        "Evaluate strategic thinking and business impact over technical accuracy."
    ),
    # General
    "behavioral": (
        "Focus on behavioural competencies using the STAR method (Situation, Task, Action, Result). "
        "Ask about leadership, conflict resolution, handling failure, collaboration, time management, "
        "adaptability, and career motivations. Probe for specifics — vague answers should be followed up "
        "with 'Can you give a concrete example?'"
    ),
}

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
    # Engineering
    "backend_engineering": "Backend Engineering",
    "frontend_engineering": "Frontend Engineering",
    "full_stack": "Full Stack Engineering",
    "mobile": "Mobile Development (iOS/Android)",
    # Data & AI
    "machine_learning": "Machine Learning / AI",
    "data_engineering": "Data Engineering & Analytics",
    # Architecture
    "system_design": "System Design & Architecture",
    # Product
    "product_management": "Product Management",
    # Operations
    "devops_cloud": "DevOps / Cloud Engineering",
    # Marketing
    "digital_marketing": "Digital Marketing",
    "seo_content": "SEO / Content Strategy",
    "performance_marketing": "Performance Marketing (Paid Ads)",
    # General
    "behavioral": "Behavioral (STAR Method)",
    # Legacy aliases — kept for backward compatibility
    "general": "General Software Engineering",
    "backend_development": "Backend Development and APIs",
}

_PERSONA_PROMPTS = {
    "friendly": (
        "\n\n**Interviewer Style (Friendly):** Maintain a warm, encouraging tone. "
        "Soften any pushback with positive framing (e.g. 'That's a good start — can you also consider…'). "
        "Briefly celebrate strong answers before moving on."
    ),
    "neutral": (
        "\n\n**Interviewer Style (Neutral):** Professional and balanced. "
        "Acknowledge answers factually — no excessive praise or harshness. "
        "Standard professional interview experience."
    ),
    "tough": (
        "\n\n**Interviewer Style (Tough):** Minimal warmth. High expectations. "
        "Probe aggressively on any gap — do not let vague answers slide. "
        "Push back on every answer that is not fully comprehensive. "
        "Keep acknowledgements to 5 words or fewer. Make the candidate work."
    ),
}


def build_interview_prompt(
    difficulty: str,
    topic: str,
    resume_text: str | None = None,
    persona: str = "neutral",
    job_description: str | None = None,
    covered_topics: list | None = None,
    parsed_resume: dict | None = None,
) -> str:
    """Build a dynamic system prompt from the base prompt + difficulty/topic/resume/JD context."""
    base = settings.load_system_prompt()

    sections = [base]

    difficulty_key = difficulty.lower() if difficulty.lower() in _DIFFICULTY_INSTRUCTIONS else "intermediate"
    sections.append(f"\n\n**Difficulty Level:** {_DIFFICULTY_INSTRUCTIONS[difficulty_key]}")

    topic_label = _TOPIC_LABELS.get(topic, topic.replace("_", " ").title())
    sections.append(f"\n\n**Interview Focus Area:** {topic_label}")

    role_instruction = _ROLE_PROMPTS.get(topic)
    if role_instruction:
        sections.append(f"\n\n**Role-Specific Focus:** {role_instruction}")

    if parsed_resume:
        skills   = ", ".join(parsed_resume.get("skills", [])[:20]) or "not listed"
        exp_lines = [
            f"- {e.get('title', '')} at {e.get('company', '')} ({e.get('duration', '')}): "
            + "; ".join(e.get("highlights", [])[:2])
            for e in parsed_resume.get("experience", [])[:3]
        ]
        proj_lines = [
            f"- {p.get('name', '')}: {p.get('description', '')} "
            f"[{', '.join(p.get('tech_stack', [])[:5])}]"
            for p in parsed_resume.get("projects", [])[:3]
        ]
        sections.append(
            f"\n\n**Candidate Background (from resume):**"
            f"\nSkills: {skills}"
            + (f"\nExperience:\n" + "\n".join(exp_lines) if exp_lines else "")
            + (f"\nProjects:\n" + "\n".join(proj_lines) if proj_lines else "")
        )
    elif resume_text:
        sections.append(
            f"\n\n**Candidate Resume (personalize questions based on this background):**\n{resume_text[:3000]}"
        )

    if job_description:
        jd_truncated = job_description[:2000]
        jd_section = f"\n\n**Target Job Description:**\n{jd_truncated}"
        if resume_text:
            jd_section += (
                "\n\n**Skill Focus:** Prioritize questions that probe skills mentioned in the JD "
                "that are absent or lightly covered in the resume. For skills that do match, still "
                "probe depth — do not assume proficiency."
            )
        sections.append(jd_section)

    if covered_topics:
        topics_str = "\n".join(f"- {t}" for t in covered_topics[-10:])
        sections.append(
            f"\n\n**Topics Already Covered (do not re-ask about these):**\n{topics_str}"
        )

    persona_key = persona.lower() if persona.lower() in _PERSONA_PROMPTS else "neutral"
    sections.append(_PERSONA_PROMPTS[persona_key])

    return "".join(sections)


def build_opening_instruction(difficulty: str, topic: str) -> str:
    """Instruction appended to the first user message to kick off the interview."""
    topic_label = _TOPIC_LABELS.get(topic, topic.replace("_", " ").title())
    return (
        f"Please begin the interview. Start with a warm welcome (1 sentence), "
        f"then ask your first {difficulty}-level {topic_label} interview question."
    )