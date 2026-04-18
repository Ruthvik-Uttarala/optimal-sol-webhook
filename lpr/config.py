from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import uuid
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class DetectorWeightsConfig:
    repo_id: str = "yasirfaizahmed/license-plate-object-detection"
    revision: str = "2632bbf"
    filename: str = "best.pt"
    sha256: str = "d06657407970f80f1a12eb9f340661ecd003bbe44ff8feac3d5bc38845f11a94"
    local_path: str = str(REPO_ROOT / "lpr" / "models" / "detector" / "best.pt")
    image_size: int = 640
    max_detections: int = 3
    bbox_padding: float = 0.08


@dataclass
class OcrConfig:
    languages: list[str] = field(default_factory=lambda: ["en"])
    gpu: bool = False
    allowlist: str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    model_dir: str = str(REPO_ROOT / "lpr" / "models" / "easyocr")
    crop_height: int = 96
    min_width: int = 220


@dataclass
class CaptureConfig:
    mode: str = "webcam"
    device_index: int = 0
    width: int = 1280
    height: int = 720
    fps: int = 15
    frame_skip: int = 1
    preview: bool = False
    video_path: str | None = None
    frames_dir: str | None = None


@dataclass
class ConsensusConfig:
    window_seconds: float = 2.0
    min_agree: int = 3
    min_detector_confidence: float = 0.45
    min_ocr_confidence: float = 0.55
    emit_confidence: float = 0.78
    pending_review_confidence: float = 0.65
    emit_pending_review: bool = False
    cooldown_seconds: int = 20
    min_plate_length: int = 5
    max_plate_length: int = 10


@dataclass
class WebhookConfig:
    base_url: str = os.getenv("PARKINGSOL_API_BASE_URL", "").strip()
    path: str = "/api/v1/webhooks/lpr/events"
    api_client_secret_env: str = "PARKINGSOL_LPR_SECRET"
    timeout_seconds: float = 10.0


@dataclass
class EvidenceConfig:
    enabled: bool = True
    directory: str = str(REPO_ROOT / "demo" / "runtime" / "evidence")
    jpeg_quality: int = 92


@dataclass
class RuntimeConfig:
    pipeline_name: str = "parksol-lpr-v2"
    device: str = "cpu"
    max_events: int = 0
    print_suppressed: bool = True


@dataclass
class LprConfig:
    source_key: str = "lpr-webcam-demo"
    event_source: str = "lpr"
    source_type: str = "webcam_lpr"
    event_type: str = "plate_detected"
    direction: str = "unknown"
    camera_name: str = "laptop-webcam-01"
    camera_label: str = "Laptop Webcam Demo"
    camera_id: str = "cam_laptop_01"
    demo_mode: bool = True
    demo_session_id: str = ""
    session_key: str = ""
    detector: DetectorWeightsConfig = field(default_factory=DetectorWeightsConfig)
    ocr: OcrConfig = field(default_factory=OcrConfig)
    capture: CaptureConfig = field(default_factory=CaptureConfig)
    consensus: ConsensusConfig = field(default_factory=ConsensusConfig)
    webhook: WebhookConfig = field(default_factory=WebhookConfig)
    evidence: EvidenceConfig = field(default_factory=EvidenceConfig)
    runtime: RuntimeConfig = field(default_factory=RuntimeConfig)


def _materialize_config(data: dict[str, Any]) -> LprConfig:
    detector = DetectorWeightsConfig(**data.get("detector", {}))
    ocr = OcrConfig(**data.get("ocr", {}))
    capture = CaptureConfig(**data.get("capture", {}))
    consensus = ConsensusConfig(**data.get("consensus", {}))
    webhook = WebhookConfig(**data.get("webhook", {}))
    evidence = EvidenceConfig(**data.get("evidence", {}))
    runtime = RuntimeConfig(**data.get("runtime", {}))
    top_level = {
        key: value
        for key, value in data.items()
        if key not in {"detector", "ocr", "capture", "consensus", "webhook", "evidence", "runtime"}
    }
    config = LprConfig(
        detector=detector,
        ocr=ocr,
        capture=capture,
        consensus=consensus,
        webhook=webhook,
        evidence=evidence,
        runtime=runtime,
        **top_level,
    )
    if not config.demo_session_id:
        config.demo_session_id = os.getenv(
            "PARKINGSOL_DEMO_SESSION_ID",
            datetime.now(timezone.utc).strftime("demo-%Y%m%d-%H%M%S"),
        )
    if not config.session_key:
        config.session_key = f"session-{uuid.uuid4().hex[:10]}"
    return config


def load_config(config_path: str | None = None) -> LprConfig:
    base = asdict(LprConfig())
    override: dict[str, Any] = {}
    if config_path:
        path = Path(config_path)
        if not path.is_absolute():
            path = (REPO_ROOT / config_path).resolve()
        if path.exists():
            override = json.loads(path.read_text(encoding="utf-8"))
    merged = _deep_merge(base, override)
    config = _materialize_config(merged)
    config.demo_mode = _env_bool("PARKINGSOL_LPR_DEMO_MODE", config.demo_mode)
    config.capture.preview = _env_bool("PARKINGSOL_LPR_PREVIEW", config.capture.preview)
    if os.getenv("PARKINGSOL_API_BASE_URL"):
        config.webhook.base_url = os.getenv("PARKINGSOL_API_BASE_URL", "").strip()
    if os.getenv("PARKINGSOL_LPR_SOURCE_KEY"):
        config.source_key = os.getenv("PARKINGSOL_LPR_SOURCE_KEY", "").strip()
    return config

