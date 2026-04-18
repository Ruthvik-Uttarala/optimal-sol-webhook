from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from .config import ConsensusConfig
from .normalize import is_reasonable_plate


@dataclass
class PlateCandidate:
    frame_id: int
    captured_at: datetime
    raw_text: str
    normalized_plate: str
    detector_confidence: float
    ocr_confidence: float
    overall_confidence: float
    bbox: tuple[int, int, int, int]
    crop: Any | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class StablePlateRead:
    normalized_plate: str
    raw_text: str
    detector_confidence: float
    ocr_confidence: float
    confidence: float
    consensus_count: int
    first_seen_at: datetime
    last_seen_at: datetime
    bbox: tuple[int, int, int, int]
    representative_candidate: PlateCandidate
    stabilized_latency_ms: int
    manual_review_required: bool = False
    suppression_reason: str | None = None


class TemporalConsensus:
    def __init__(self, config: ConsensusConfig):
        self.config = config
        self._candidates: deque[PlateCandidate] = deque()
        self._last_emitted: dict[str, datetime] = {}

    def _prune(self, now: datetime) -> None:
        cutoff = now - timedelta(seconds=self.config.window_seconds)
        while self._candidates and self._candidates[0].captured_at < cutoff:
            self._candidates.popleft()
        expired = [plate for plate, until in self._last_emitted.items() if until < now]
        for plate in expired:
            self._last_emitted.pop(plate, None)

    def _evaluate(self) -> StablePlateRead | None:
        groups: dict[str, list[PlateCandidate]] = defaultdict(list)
        for candidate in self._candidates:
            groups[candidate.normalized_plate].append(candidate)
        if not groups:
            return None

        best_plate, best_group = max(
            groups.items(),
            key=lambda item: (
                len(item[1]),
                round(sum(candidate.overall_confidence for candidate in item[1]), 4),
            ),
        )
        if not is_reasonable_plate(
            best_plate,
            self.config.min_plate_length,
            self.config.max_plate_length,
        ):
            return None
        if len(best_group) < self.config.min_agree:
            return None

        avg_detector = sum(candidate.detector_confidence for candidate in best_group) / len(best_group)
        avg_ocr = sum(candidate.ocr_confidence for candidate in best_group) / len(best_group)
        avg_score = sum(candidate.overall_confidence for candidate in best_group) / len(best_group)
        best_candidate = max(best_group, key=lambda candidate: candidate.overall_confidence)
        first_seen = min(candidate.captured_at for candidate in best_group)
        last_seen = max(candidate.captured_at for candidate in best_group)

        manual_review = False
        if avg_detector < self.config.min_detector_confidence or avg_ocr < self.config.min_ocr_confidence:
            if not self.config.emit_pending_review or avg_score < self.config.pending_review_confidence:
                return None
            manual_review = True
        elif avg_score < self.config.emit_confidence:
            if not self.config.emit_pending_review or avg_score < self.config.pending_review_confidence:
                return None
            manual_review = True

        return StablePlateRead(
            normalized_plate=best_plate,
            raw_text=best_candidate.raw_text,
            detector_confidence=round(avg_detector, 4),
            ocr_confidence=round(avg_ocr, 4),
            confidence=round(avg_score, 4),
            consensus_count=len(best_group),
            first_seen_at=first_seen,
            last_seen_at=last_seen,
            bbox=best_candidate.bbox,
            representative_candidate=best_candidate,
            stabilized_latency_ms=max(int((last_seen - first_seen).total_seconds() * 1000), 0),
            manual_review_required=manual_review,
        )

    def consider(self, candidate: PlateCandidate) -> tuple[str, StablePlateRead | None, str]:
        self._prune(candidate.captured_at)
        if not is_reasonable_plate(
            candidate.normalized_plate,
            self.config.min_plate_length,
            self.config.max_plate_length,
        ):
            return ("suppressed", None, "invalid_plate_shape")
        self._candidates.append(candidate)
        stable = self._evaluate()
        if not stable:
            return ("suppressed", None, "not_stable")
        cooldown_until = self._last_emitted.get(stable.normalized_plate)
        if cooldown_until and cooldown_until > candidate.captured_at:
            stable.suppression_reason = "cooldown_active"
            return ("suppressed", stable, "cooldown_active")
        if stable.manual_review_required:
            return ("pending_review", stable, "low_confidence_pending_review")
        return ("emit", stable, "stable")

    def mark_emitted(self, plate: str, emitted_at: datetime) -> None:
        self._last_emitted[plate] = emitted_at + timedelta(seconds=self.config.cooldown_seconds)

