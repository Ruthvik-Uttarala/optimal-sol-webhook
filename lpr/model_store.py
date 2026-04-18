from __future__ import annotations

import hashlib
from pathlib import Path
import shutil

from huggingface_hub import hf_hub_download

from .config import DetectorWeightsConfig


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def ensure_detector_weights(config: DetectorWeightsConfig) -> Path:
    local_path = Path(config.local_path)
    local_path.parent.mkdir(parents=True, exist_ok=True)
    if local_path.exists():
        if not config.sha256 or _sha256(local_path) == config.sha256:
            return local_path
        local_path.unlink()

    downloaded_path = Path(
        hf_hub_download(
            repo_id=config.repo_id,
            filename=config.filename,
            revision=config.revision,
            local_dir=local_path.parent,
        )
    )
    if downloaded_path.resolve() != local_path.resolve():
        shutil.copy2(downloaded_path, local_path)
    if config.sha256 and _sha256(local_path) != config.sha256:
        raise RuntimeError(f"Detector weights checksum mismatch for {local_path}")
    return local_path

