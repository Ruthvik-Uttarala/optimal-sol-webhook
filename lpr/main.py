from __future__ import annotations

import argparse
from datetime import timezone
import json
from pathlib import Path
import sys

import cv2

from .capture import create_frame_source
from .config import REPO_ROOT, load_config
from .consensus import TemporalConsensus
from .evidence import save_evidence
from .inference import LprInferenceEngine, annotate_frame
from .webhook import WebhookEmitter, build_webhook_payload


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ParkingSol webcam LPR sidecar")
    parser.add_argument("--config", default="demo/lpr.demo.example.json", help="Path to JSON config")
    parser.add_argument("--mode", choices=["webcam", "video", "frames"], default=None)
    parser.add_argument("--video", default=None, help="Replay video path")
    parser.add_argument("--frames-dir", default=None, help="Replay frames directory")
    parser.add_argument("--device-index", type=int, default=None, help="Override webcam device index")
    parser.add_argument("--preview", action="store_true", help="Show annotated preview window")
    parser.add_argument("--max-events", type=int, default=None, help="Stop after N emitted events")
    parser.add_argument("--emit-pending-review", action="store_true", help="Emit flagged pending-review events instead of suppressing low-confidence stable reads")
    return parser.parse_args()


def _write_metrics(session_key: str, metrics: list[dict[str, object]]) -> Path:
    output_dir = REPO_ROOT / "demo" / "runtime" / "metrics"
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"{session_key}.json"
    path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return path


def main() -> int:
    args = _parse_args()
    config = load_config(args.config)
    if args.mode:
        config.capture.mode = args.mode
    if args.video:
        config.capture.mode = "video"
        config.capture.video_path = args.video
    if args.frames_dir:
        config.capture.mode = "frames"
        config.capture.frames_dir = args.frames_dir
    if args.device_index is not None:
        config.capture.device_index = args.device_index
    if args.preview:
        config.capture.preview = True
    if args.max_events is not None:
        config.runtime.max_events = args.max_events
    if args.emit_pending_review:
        config.consensus.emit_pending_review = True

    source = create_frame_source(config.capture)
    inference = LprInferenceEngine(config)
    consensus = TemporalConsensus(config.consensus)
    emitter = WebhookEmitter(config)
    emitted_metrics: list[dict[str, object]] = []
    status_line = f"{config.camera_label} ready"

    try:
        for packet in source:
            detections = inference.detect_and_read(packet.frame, packet.captured_at, packet.frame_id)
            for candidate in detections:
                action, stable_read, reason = consensus.consider(candidate)
                if action == "suppressed":
                    if config.runtime.print_suppressed and reason != "not_stable":
                        print(f"[suppress] plate={candidate.normalized_plate} reason={reason}")
                    continue
                if stable_read is None:
                    continue

                evidence_metadata = {
                    "plate": stable_read.normalized_plate,
                    "rawText": stable_read.raw_text,
                    "bbox": stable_read.representative_candidate.extra.get("bbox"),
                    "detectorConfidence": stable_read.detector_confidence,
                    "ocrConfidence": stable_read.ocr_confidence,
                    "consensusCount": stable_read.consensus_count,
                    "manualReviewRequired": stable_read.manual_review_required,
                    "reason": reason,
                }
                evidence_refs = save_evidence(
                    config.evidence,
                    config.session_key,
                    stable_read.normalized_plate,
                    stable_read.last_seen_at.astimezone(timezone.utc),
                    packet.frame,
                    stable_read.representative_candidate.crop,
                    evidence_metadata,
                )
                payload = build_webhook_payload(config, stable_read, evidence_refs)
                try:
                    result = emitter.emit(payload)
                    consensus.mark_emitted(stable_read.normalized_plate, packet.captured_at)
                    emitted_metrics.append(
                        {
                            "plate": stable_read.normalized_plate,
                            "manualReviewRequired": stable_read.manual_review_required,
                            "consensusCount": stable_read.consensus_count,
                            "stableLatencyMs": stable_read.stabilized_latency_ms,
                            "webhookDurationMs": result.duration_ms,
                            "webhookStatusCode": result.status_code,
                            "backendEventId": ((result.body.get("data") or {}) if isinstance(result.body, dict) else {}).get("eventId"),
                        }
                    )
                    status_line = (
                        f"EMITTED {stable_read.normalized_plate} "
                        f"stable={stable_read.stabilized_latency_ms}ms webhook={result.duration_ms}ms"
                    )
                    print(
                        f"[emit] plate={stable_read.normalized_plate} manual_review={stable_read.manual_review_required} "
                        f"consensus={stable_read.consensus_count} stable_ms={stable_read.stabilized_latency_ms} "
                        f"webhook_ms={result.duration_ms} backend_event={((result.body.get('data') or {}) if isinstance(result.body, dict) else {}).get('eventId')}"
                    )
                except Exception as error:  # pragma: no cover - exercised in live runs
                    status_line = f"WEBHOOK FAILED {stable_read.normalized_plate}"
                    print(f"[error] webhook delivery failed for {stable_read.normalized_plate}: {error}", file=sys.stderr)

                if config.runtime.max_events and len(emitted_metrics) >= config.runtime.max_events:
                    metrics_path = _write_metrics(config.session_key, emitted_metrics)
                    print(f"[done] emitted={len(emitted_metrics)} metrics={metrics_path}")
                    return 0

            if config.capture.preview:
                preview = annotate_frame(packet.frame, detections, status_line=status_line)
                cv2.imshow("ParkingSol LPR Demo", preview)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break
    finally:
        source.close()
        if config.capture.preview:
            cv2.destroyAllWindows()

    metrics_path = _write_metrics(config.session_key, emitted_metrics)
    print(f"[done] emitted={len(emitted_metrics)} metrics={metrics_path}")
    return 0
