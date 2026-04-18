from __future__ import annotations

import re

ALPHANUMERIC_PATTERN = re.compile(r"[^A-Z0-9]")


def normalize_plate_text(value: str) -> str:
    return ALPHANUMERIC_PATTERN.sub("", value.upper())


def is_reasonable_plate(plate: str, min_length: int, max_length: int) -> bool:
    return min_length <= len(plate) <= max_length and plate.isalnum()

