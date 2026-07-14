"""Pure-unit tests for the extraction parse layer (no DB, no network).

Regression coverage for the {value,status}-envelope bug: claude-sonnet-5 wraps
the array fields (line_items / property_hints) in the same object it uses for
header fields, and the parsers used to silently drop them.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.services.extraction import (
    MockExtractionProvider,
    _parse_line_items,
    _parse_property_hints,
    _unwrap_envelope,
)


def test_unwrap_envelope_passes_through_bare_values():
    assert _unwrap_envelope([1, 2]) == [1, 2]
    assert _unwrap_envelope({"x": 1}) == {"x": 1}  # dict without "value" is untouched
    assert _unwrap_envelope(None) is None


def test_unwrap_envelope_unwraps_value_status():
    assert _unwrap_envelope({"value": [1, 2], "status": "extracted"}) == [1, 2]


def test_parse_line_items_recovers_enveloped_array():
    raw = {"value": [{"description": "Foo", "amount": "10.00"}], "status": "extracted"}
    items = _parse_line_items(raw)
    assert len(items) == 1
    assert items[0].description == "Foo"
    assert items[0].amount == Decimal("10.00")


def test_parse_line_items_accepts_bare_list():
    items = _parse_line_items([{"description": "Bar", "amount": "5"}])
    assert len(items) == 1
    assert items[0].amount == Decimal("5")


def test_parse_line_items_non_list_is_empty():
    assert _parse_line_items(None) == []
    assert _parse_line_items("nope") == []


def test_parse_line_items_skips_entries_without_description():
    items = _parse_line_items([{"amount": "5"}, {"description": "   ", "amount": "1"}])
    assert items == []


def test_parse_property_hints_unwraps_and_filters():
    assert _parse_property_hints({"value": ["a", "b"], "status": "x"}) == ["a", "b"]
    assert _parse_property_hints(["a", "b"]) == ["a", "b"]
    # regression: an enveloped dict without a list used to yield its keys ["value"...]
    assert _parse_property_hints({"x": 1}) == []
    assert _parse_property_hints(None) == []
    assert _parse_property_hints(["a", "", None, "b"]) == ["a", "b"]


async def test_mock_provider_shape():
    result = await MockExtractionProvider().extract(pdf_bytes=b"%PDF-1.7 test")
    assert result.provider == "mock"
    assert result.values_dict()["invoice_number"] == "INV-1001"
    assert len(result.line_items) == 2
    assert result.page_count == 2


async def test_mock_provider_force_ambiguous_marks_total():
    result = await MockExtractionProvider(force_ambiguous=True).extract(pdf_bytes=b"%PDF-1.7")
    assert result.field_status_dict()["total_amount"] == "ambiguous"


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-v"]))
