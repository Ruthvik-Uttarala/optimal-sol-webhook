from __future__ import annotations

from dataclasses import dataclass
from datetime import timezone
import os
import time
from typing import Any

import requests

from .config import LprConfig
from .consensus import StablePlateRead


@dataclass
class WebhookResult:
    status_code: int
    duration_ms: int
    body: dict[str, Any]


def _iso_utc_z(value) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def build_webhook_payload(
    config: LprConfig,
    stable_read: StablePlateRead,
    evidence_refs: list[dict[str, Any]],
) -> dict[str, Any]:
    emitted_at = stable_read.last_seen_at.astimezone(timezone.utc)
    bbox = {
        "x1": stable_read.bbox[0],
        "y1": stable_read.bbox[1],
        "x2": stable_read.bbox[2],
        "y2": stable_read.bbox[3],
    }
    return {
        "sourceKey": config.source_key,
        "externalEventId": f"{config.session_key}-{stable_read.normalized_plate}-{stable_read.last_seen_at.strftime('%H%M%S%f')}",
        "localEventId": f"local-{config.session_key}-{stable_read.representative_candidate.frame_id}",
        "eventSource": config.event_source,
        "sourceType": config.source_type,
        "eventType": config.event_type,
        "capturedAt": _iso_utc_z(emitted_at),
        "plate": stable_read.raw_text or stable_read.normalized_plate,
        "normalizedPlate": stable_read.normalized_plate,
        "plateConfidence": stable_read.ocr_confidence,
        "detectorConfidence": stable_read.detector_confidence,
        "cameraLabel": config.camera_label,
        "cameraName": config.camera_name,
        "cameraId": config.camera_id,
        "direction": config.direction,
        "frameConsensusCount": stable_read.consensus_count,
        "manualReviewRequired": stable_read.manual_review_required,
        "demoSessionId": config.demo_session_id,
        "demoMode": config.demo_mode,
        "sessionKey": config.session_key,
        "evidenceRefs": evidence_refs,
        "recognitionMetadata": {
            "firstSeenAt": _iso_utc_z(stable_read.first_seen_at),
            "lastSeenAt": _iso_utc_z(emitted_at),
            "stabilizedLatencyMs": stable_read.stabilized_latency_ms,
            "bbox": bbox,
            "rawText": stable_read.raw_text,
            **stable_read.representative_candidate.extra,
        },
        "lprModelInfo": {
            "pipeline": config.runtime.pipeline_name,
            "detectorRepoId": config.detector.repo_id,
            "detectorRevision": config.detector.revision,
            "detectorWeightsSha256": config.detector.sha256,
            "ocrEngine": "easyocr",
            "ocrLanguages": config.ocr.languages,
        },
        "metadata": {
            "bbox": bbox,
            "device": config.runtime.device,
            "previewEnabled": config.capture.preview,
        },
    }


class WebhookEmitter:
    def __init__(self, config: LprConfig):
        self._config = config
        self._secret = os.getenv(config.webhook.api_client_secret_env, "").strip()
        if not config.webhook.base_url:
            raise RuntimeError("PARKINGSOL_API_BASE_URL is required for webhook delivery")
        if not self._secret:
            raise RuntimeError(f"{config.webhook.api_client_secret_env} is required for webhook delivery")
        base_url = config.webhook.base_url.rstrip("/")
        if base_url.lower().endswith("/api/v1") and config.webhook.path.lower().startswith("/api/v1/"):
            base_url = base_url[:-7]
        self._url = f"{base_url}{config.webhook.path}"

    def emit(self, payload: dict[str, Any]) -> WebhookResult:
        started = time.perf_counter()
        response = requests.post(
            self._url,
            json=payload,
            headers={
                "content-type": "application/json",
                "x-api-client-secret": self._secret,
            },
            timeout=self._config.webhook.timeout_seconds,
        )
        duration_ms = int((time.perf_counter() - started) * 1000)
        if response.status_code >= 400:
            snippet = response.text[:1000] if response.text else ""
            raise requests.HTTPError(
                f"{response.status_code} {response.reason} for url: {self._url} body={snippet}",
                response=response,
            )
        body = response.json() if response.content else {}
        return WebhookResult(status_code=response.status_code, duration_ms=duration_ms, body=body)
