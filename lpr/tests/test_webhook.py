from datetime import datetime, timezone

from lpr.config import LprConfig
from lpr.consensus import PlateCandidate, StablePlateRead
from lpr.webhook import build_webhook_payload


def test_build_webhook_payload_contains_lpr_fields() -> None:
    captured_at = datetime(2026, 4, 16, 16, 30, tzinfo=timezone.utc)
    candidate = PlateCandidate(
        frame_id=1,
        captured_at=captured_at,
        raw_text="ABC1234",
        normalized_plate="ABC1234",
        detector_confidence=0.91,
        ocr_confidence=0.94,
        overall_confidence=0.93,
        bbox=(1, 2, 3, 4),
        extra={"ocrView": "threshold"},
    )
    stable = StablePlateRead(
        normalized_plate="ABC1234",
        raw_text="ABC1234",
        detector_confidence=0.91,
        ocr_confidence=0.94,
        confidence=0.93,
        consensus_count=4,
        first_seen_at=captured_at,
        last_seen_at=captured_at,
        bbox=(1, 2, 3, 4),
        representative_candidate=candidate,
        stabilized_latency_ms=800,
    )

    payload = build_webhook_payload(LprConfig(), stable, [])
    assert payload["sourceType"] == "webcam_lpr"
    assert payload["frameConsensusCount"] == 4
    assert payload["recognitionMetadata"]["stabilizedLatencyMs"] == 800
    assert payload["lprModelInfo"]["ocrEngine"] == "easyocr"
