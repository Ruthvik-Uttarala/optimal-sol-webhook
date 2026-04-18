from __future__ import annotations

from datetime import datetime
from typing import Any

import cv2
import easyocr
import numpy as np
from ultralytics import YOLO

from .config import LprConfig
from .consensus import PlateCandidate
from .model_store import ensure_detector_weights
from .normalize import is_reasonable_plate, normalize_plate_text


class LprInferenceEngine:
    def __init__(self, config: LprConfig):
        self._config = config
        detector_weights = ensure_detector_weights(config.detector)
        self._detector = YOLO(str(detector_weights))
        self._reader = easyocr.Reader(
            config.ocr.languages,
            gpu=config.ocr.gpu,
            model_storage_directory=config.ocr.model_dir,
            download_enabled=True,
        )

    def _crop_with_padding(self, frame: np.ndarray, bbox: tuple[int, int, int, int]) -> np.ndarray:
        height, width = frame.shape[:2]
        x1, y1, x2, y2 = bbox
        pad_x = int((x2 - x1) * self._config.detector.bbox_padding)
        pad_y = int((y2 - y1) * self._config.detector.bbox_padding)
        return frame[
            max(y1 - pad_y, 0) : min(y2 + pad_y, height),
            max(x1 - pad_x, 0) : min(x2 + pad_x, width),
        ]

    def _resize_keep_aspect(self, image: np.ndarray) -> np.ndarray:
        target_height = self._config.ocr.crop_height
        height, width = image.shape[:2]
        if height == 0 or width == 0:
            return image
        scale = target_height / float(height)
        target_width = max(int(width * scale), self._config.ocr.min_width)
        return cv2.resize(image, (target_width, target_height), interpolation=cv2.INTER_CUBIC)

    def _build_ocr_views(self, crop: np.ndarray) -> list[tuple[str, np.ndarray]]:
        resized_color = self._resize_keep_aspect(crop)
        gray = cv2.cvtColor(resized_color, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
        denoised = cv2.bilateralFilter(clahe, 7, 75, 75)
        _, thresholded = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return [
          ("color", resized_color),
          ("contrast", denoised),
          ("threshold", thresholded),
        ]

    def _recognize_crop(self, crop: np.ndarray) -> tuple[str, str, float, str] | None:
        best: tuple[str, str, float, str] | None = None
        for label, view in self._build_ocr_views(crop):
            results = self._reader.readtext(
                view,
                detail=1,
                paragraph=False,
                allowlist=self._config.ocr.allowlist,
                decoder="greedy",
                text_threshold=0.5,
                low_text=0.3,
                width_ths=0.7,
                link_threshold=0.2,
            )
            for result in results:
                if len(result) < 3:
                    continue
                raw_text = str(result[1]).strip()
                confidence = float(result[2])
                normalized = normalize_plate_text(raw_text)
                if not is_reasonable_plate(
                    normalized,
                    self._config.consensus.min_plate_length,
                    self._config.consensus.max_plate_length,
                ):
                    continue
                if best is None or confidence > best[2]:
                    best = (raw_text, normalized, confidence, label)
        return best

    def detect_and_read(
        self,
        frame: np.ndarray,
        captured_at: datetime,
        frame_id: int,
    ) -> list[PlateCandidate]:
        results = self._detector.predict(
            source=frame,
            imgsz=self._config.detector.image_size,
            conf=self._config.consensus.min_detector_confidence,
            device=self._config.runtime.device,
            max_det=self._config.detector.max_detections,
            verbose=False,
        )
        if not results:
            return []

        candidates: list[PlateCandidate] = []
        boxes = getattr(results[0], "boxes", None)
        if boxes is None:
            return candidates

        for box_index, box in enumerate(boxes):
            xyxy = box.xyxy[0].tolist()
            bbox = tuple(int(round(value)) for value in xyxy)
            detector_confidence = float(box.conf[0].item()) if box.conf is not None else 0.0
            crop = self._crop_with_padding(frame, bbox)
            if crop.size == 0:
                continue
            ocr_result = self._recognize_crop(crop)
            if not ocr_result:
                continue

            raw_text, normalized_plate, ocr_confidence, ocr_view = ocr_result
            candidates.append(
                PlateCandidate(
                    frame_id=frame_id,
                    captured_at=captured_at,
                    raw_text=raw_text,
                    normalized_plate=normalized_plate,
                    detector_confidence=detector_confidence,
                    ocr_confidence=ocr_confidence,
                    overall_confidence=round((detector_confidence * 0.4) + (ocr_confidence * 0.6), 4),
                    bbox=bbox,
                    crop=crop,
                    extra={
                        "ocrView": ocr_view,
                        "bbox": {
                            "x1": bbox[0],
                            "y1": bbox[1],
                            "x2": bbox[2],
                            "y2": bbox[3],
                        },
                        "detectionIndex": box_index,
                    },
                )
            )

        return sorted(candidates, key=lambda candidate: candidate.overall_confidence, reverse=True)


def annotate_frame(frame: np.ndarray, detections: list[PlateCandidate], status_line: str | None = None) -> np.ndarray:
    annotated = frame.copy()
    for candidate in detections:
        x1, y1, x2, y2 = candidate.bbox
        cv2.rectangle(annotated, (x1, y1), (x2, y2), (36, 255, 12), 2)
        label = f"{candidate.normalized_plate} d={candidate.detector_confidence:.2f} o={candidate.ocr_confidence:.2f}"
        cv2.putText(annotated, label, (x1, max(24, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (36, 255, 12), 2)
    if status_line:
        cv2.putText(annotated, status_line, (24, 36), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
    return annotated

