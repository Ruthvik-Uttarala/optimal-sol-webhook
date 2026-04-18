from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Iterator

import cv2
import numpy as np

from .config import CaptureConfig


@dataclass
class FramePacket:
    frame_id: int
    captured_at: datetime
    frame: np.ndarray


class BaseFrameSource:
    def __iter__(self) -> Iterator[FramePacket]:
        raise NotImplementedError

    def close(self) -> None:
        return


class WebcamFrameSource(BaseFrameSource):
    def __init__(self, config: CaptureConfig):
        backend = cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY
        self._capture = cv2.VideoCapture(config.device_index, backend)
        if not self._capture.isOpened():
            raise RuntimeError(f"Unable to open webcam index {config.device_index}")
        self._capture.set(cv2.CAP_PROP_FRAME_WIDTH, config.width)
        self._capture.set(cv2.CAP_PROP_FRAME_HEIGHT, config.height)
        self._capture.set(cv2.CAP_PROP_FPS, config.fps)
        self._frame_skip = max(config.frame_skip, 0)

    def __iter__(self) -> Iterator[FramePacket]:
        frame_id = 0
        while True:
            ok, frame = self._capture.read()
            if not ok:
                raise RuntimeError("Webcam read failed")
            if self._frame_skip and frame_id % (self._frame_skip + 1) != 0:
                frame_id += 1
                continue
            yield FramePacket(
                frame_id=frame_id,
                captured_at=datetime.now(timezone.utc),
                frame=frame,
            )
            frame_id += 1

    def close(self) -> None:
        self._capture.release()


class VideoReplaySource(BaseFrameSource):
    def __init__(self, video_path: str, frame_skip: int):
        self._capture = cv2.VideoCapture(video_path)
        if not self._capture.isOpened():
            raise RuntimeError(f"Unable to open replay video {video_path}")
        self._frame_skip = max(frame_skip, 0)

    def __iter__(self) -> Iterator[FramePacket]:
        frame_id = 0
        while True:
            ok, frame = self._capture.read()
            if not ok:
                break
            if self._frame_skip and frame_id % (self._frame_skip + 1) != 0:
                frame_id += 1
                continue
            yield FramePacket(frame_id=frame_id, captured_at=datetime.now(timezone.utc), frame=frame)
            frame_id += 1

    def close(self) -> None:
        self._capture.release()


class FramesDirectorySource(BaseFrameSource):
    def __init__(self, frames_dir: str):
        self._paths = sorted(
            [
                path
                for path in Path(frames_dir).glob("*")
                if path.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp"}
            ]
        )
        if not self._paths:
            raise RuntimeError(f"No replay frames found in {frames_dir}")

    def __iter__(self) -> Iterator[FramePacket]:
        for frame_id, path in enumerate(self._paths):
            frame = cv2.imread(str(path))
            if frame is None:
                continue
            yield FramePacket(frame_id=frame_id, captured_at=datetime.now(timezone.utc), frame=frame)


def create_frame_source(config: CaptureConfig) -> BaseFrameSource:
    if config.mode == "video" and config.video_path:
        return VideoReplaySource(config.video_path, config.frame_skip)
    if config.mode == "frames" and config.frames_dir:
        return FramesDirectorySource(config.frames_dir)
    return WebcamFrameSource(config)

