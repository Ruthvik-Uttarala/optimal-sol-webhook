from lpr.normalize import is_reasonable_plate, normalize_plate_text


def test_normalize_plate_text_strips_non_alphanumeric() -> None:
    assert normalize_plate_text(" ab-c 123 ") == "ABC123"


def test_reasonable_plate_bounds() -> None:
    assert is_reasonable_plate("ABC123", 5, 10) is True
    assert is_reasonable_plate("AB", 5, 10) is False

