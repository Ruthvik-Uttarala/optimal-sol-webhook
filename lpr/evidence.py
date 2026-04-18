from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .config import EvidenceConfig, REPO_ROOT


def _relative_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return str(path.resolve())


def _iso_utc_z(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def save_evidence(
    config: EvidenceConfig,
    session_key: str,
    plate: str,
    captured_at: datetime,
    frame: np.ndarray,
    crop: np.ndarray | None,
    metadata: dict[str, Any],
) -> list[dict[str, Any]]:
    if not config.enabled:
        return []

    base_dir = Path(config.directory) / session_key
    base_dir.mkdir(parents=True, exist_ok=True)
    stamp = captured_at.strftime("%Y%m%dT%H%M%S_%f")
    frame_path = base_dir / f"{stamp}_{plate}_frame.jpg"
    cv2.imwrite(str(frame_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), config.jpeg_quality])

    evidence_refs: list[dict[str, Any]] = [
        {
            "kind": "frame",
            "label": "frame",
            "path": _relative_path(frame_path),
            "contentType": "image/jpeg",
            "capturedAt": _iso_utc_z(captured_at),
        }
    ]

    if crop is not None and crop.size:
        crop_path = base_dir / f"{stamp}_{plate}_crop.jpg"
        cv2.imwrite(str(crop_path), crop, [int(cv2.IMWRITE_JPEG_QUALITY), config.jpeg_quality])
        evidence_refs.append(
            {
                "kind": "plate_crop",
                "label": "plate crop",
                "path": _relative_path(crop_path),
                "contentType": "image/jpeg",
                "capturedAt": _iso_utc_z(captured_at),
            }
        )

    metadata_path = base_dir / f"{stamp}_{plate}_metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    evidence_refs.append(
        {
            "kind": "metadata",
            "label": "metadata",
            "path": _relative_path(metadata_path),
            "contentType": "application/json",
            "capturedAt": _iso_utc_z(captured_at),
        }
    )

    return evidence_refs
