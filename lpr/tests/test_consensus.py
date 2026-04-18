from datetime import datetime, timedelta, timezone

from lpr.config import ConsensusConfig
from lpr.consensus import PlateCandidate, TemporalConsensus


def _candidate(frame_id: int, plate: str, offset_ms: int, detector: float = 0.9, ocr: float = 0.92) -> PlateCandidate:
    captured_at = datetime(2026, 4, 16, 16, 0, 0, tzinfo=timezone.utc) + timedelta(milliseconds=offset_ms)
    return PlateCandidate(
        frame_id=frame_id,
        captured_at=captured_at,
        raw_text=plate,
        normalized_plate=plate,
        detector_confidence=detector,
        ocr_confidence=ocr,
        overall_confidence=(detector * 0.4) + (ocr * 0.6),
        bbox=(0, 0, 10, 10),
    )


def test_consensus_requires_multiple_agreeing_frames() -> None:
    consensus = TemporalConsensus(ConsensusConfig(min_agree=3))
    assert consensus.consider(_candidate(1, "ABC123", 0))[0] == "suppressed"
    assert consensus.consider(_candidate(2, "ABC123", 200))[0] == "suppressed"
    action, stable, _ = consensus.consider(_candidate(3, "ABC123", 400))
    assert action == "emit"
    assert stable is not None
    assert stable.consensus_count == 3


def test_consensus_respects_duplicate_cooldown() -> None:
    consensus = TemporalConsensus(ConsensusConfig(min_agree=2, cooldown_seconds=20))
    action, stable, _ = consensus.consider(_candidate(1, "DUP123", 0))
    assert action == "suppressed"
    action, stable, _ = consensus.consider(_candidate(2, "DUP123", 150))
    assert action == "emit"
    assert stable is not None
    consensus.mark_emitted("DUP123", stable.last_seen_at)
    action, stable, reason = consensus.consider(_candidate(3, "DUP123", 300))
    assert action == "suppressed"
    assert reason == "cooldown_active"


def test_consensus_can_emit_pending_review() -> None:
    consensus = TemporalConsensus(
        ConsensusConfig(
            min_agree=2,
            emit_confidence=0.9,
            pending_review_confidence=0.7,
            emit_pending_review=True,
        )
    )
    consensus.consider(_candidate(1, "LOW123", 0, detector=0.75, ocr=0.74))
    action, stable, _ = consensus.consider(_candidate(2, "LOW123", 200, detector=0.75, ocr=0.74))
    assert action == "pending_review"
    assert stable is not None
    assert stable.manual_review_required is True

