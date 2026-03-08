from dataclasses import dataclass

from app.config import settings


@dataclass
class PerformanceMetrics:
    transcription_time: float = 0
    llm_time: float = 0
    tts_time: float = 0
    total_time: float = 0
    audio_duration: float = 0
    cache_hit: bool = False


class PerformanceMonitor:
    def __init__(self, max_metrics: int = 50):
        self.metrics: list[PerformanceMetrics] = []
        self.max_metrics = max_metrics

    def add_metrics(self, metrics: PerformanceMetrics):
        self.metrics.append(metrics)
        if len(self.metrics) > self.max_metrics:
            self.metrics.pop(0)

    def get_avg_times(self) -> dict[str, float]:
        if not self.metrics:
            return {}
        count = len(self.metrics)
        return {
            "avg_transcription": sum(m.transcription_time for m in self.metrics) / count,
            "avg_llm": sum(m.llm_time for m in self.metrics) / count,
            "avg_tts": sum(m.tts_time for m in self.metrics) / count,
            "avg_total": sum(m.total_time for m in self.metrics) / count,
            "cache_hit_rate": sum(1 for m in self.metrics if m.cache_hit) / count,
        }


perf_monitor = PerformanceMonitor()
