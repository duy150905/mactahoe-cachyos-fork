#!/usr/bin/env python3
"""Ghi ngày Dương lịch + Âm lịch hôm nay cho widget Conky MacTahoe."""

from __future__ import annotations

import os
import sys
import tempfile
from datetime import date
from pathlib import Path

CACHE_DIR = Path.home() / ".cache" / "mactahoe-widgets"
STATE_FILE = CACHE_DIR / "lunar.state"
LUNAR_APP_DIR = Path.home() / ".local" / "share" / "mactahoe-widgets"


def write_state(values: dict[str, str]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        dir=CACHE_DIR, prefix=".lunar-", suffix=".state"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            for key, value in values.items():
                handle.write(f"{key}={value}\n")
        os.replace(tmp_name, STATE_FILE)
    finally:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass


def main() -> int:
    try:
        sys.path.insert(0, str(LUNAR_APP_DIR))
        from lunar import WEEKDAYS, can_chi_day, convert_solar_to_lunar
    except Exception as exc:
        write_state({"error": str(exc)})
        return 1

    today = date.today()
    try:
        lunar = convert_solar_to_lunar(today)
    except Exception as exc:
        write_state({"error": str(exc)})
        return 1

    lunar_text = f"{lunar.day} tháng {lunar.month}"
    if lunar.leap:
        lunar_text += " nhuận"

    write_state(
        {
            "solar_day": str(today.day),
            "solar_month": str(today.month),
            "solar_year": str(today.year),
            "weekday": WEEKDAYS[today.weekday()],
            "lunar_day": str(lunar.day),
            "lunar_month": str(lunar.month),
            "lunar_leap": "1" if lunar.leap else "0",
            "lunar_text": lunar_text,
            "lunar_year_name": lunar.year_name,
            "can_chi_day": can_chi_day(today),
        }
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
