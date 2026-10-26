#!/usr/bin/env python3
"""Lấy thời tiết Open-Meteo và ghi cache cho widget Conky MacTahoe."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

CACHE_DIR = Path.home() / ".cache" / "mactahoe-widgets"
CACHE_FILE = CACHE_DIR / "weather.json"
STATE_FILE = CACHE_DIR / "weather.state"
LOG_FILE = CACHE_DIR / "weather.log"
ICON_DIR = CACHE_DIR / "icons"
CONFIG_FILE = Path.home() / ".config" / "mactahoe-widgets" / "weather.conf"

DEFAULT_CONFIG = {
    "LAT": "21.0285",
    "LON": "105.8542",
    "CITY": "Hà Nội",
    "TIMEZONE": "Asia/Ho_Chi_Minh",
    "LOCATION_MODE": "manual",
    "ICON_THEME": str(
        Path.home()
        / ".local/share/icons/MacTahoe-blue/status/32"
    ),
}

WEEKDAYS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"]

# WMO weather code -> (mô tả, tên icon ngày, tên icon đêm)
WEATHER_CODES: dict[int, tuple[str, str, str]] = {
    0: ("Trời quang", "weather-clear", "weather-clear-night"),
    1: ("Ít mây", "weather-few-clouds", "weather-few-clouds-night"),
    2: ("Có mây", "weather-few-clouds", "weather-few-clouds-night"),
    3: ("Nhiều mây", "weather-overcast", "weather-overcast-night"),
    45: ("Sương mù", "weather-fog", "weather-fog"),
    48: ("Sương mù", "weather-fog", "weather-fog"),
    51: ("Mưa phùn", "weather-showers-scattered", "weather-showers-scattered-night"),
    53: ("Mưa phùn", "weather-showers", "weather-showers-night"),
    55: ("Mưa phùn", "weather-showers", "weather-showers-night"),
    56: ("Mưa băng", "weather-snow-rain", "weather-snow-rain"),
    57: ("Mưa băng", "weather-snow-rain", "weather-snow-rain"),
    61: ("Mưa nhẹ", "weather-showers-scattered", "weather-showers-scattered-night"),
    63: ("Mưa", "weather-showers", "weather-showers-night"),
    65: ("Mưa to", "weather-showers-large", "weather-showers-large"),
    66: ("Mưa băng", "weather-snow-rain", "weather-snow-rain"),
    67: ("Mưa băng", "weather-snow-rain", "weather-snow-rain"),
    71: ("Tuyết nhẹ", "weather-snow-scattered", "weather-snow-scattered-night"),
    73: ("Tuyết", "weather-snow", "weather-snow-night"),
    75: ("Tuyết dày", "weather-snow-large", "weather-snow-large"),
    77: ("Mưa tuyết", "weather-snow-rain", "weather-snow-rain"),
    80: ("Mưa rào", "weather-showers-scattered", "weather-showers-scattered-night"),
    81: ("Mưa rào", "weather-showers", "weather-showers-night"),
    82: ("Mưa rào to", "weather-showers-large", "weather-showers-large"),
    85: ("Mưa tuyết", "weather-snow", "weather-snow-night"),
    86: ("Mưa tuyết", "weather-snow-large", "weather-snow-large"),
    95: ("Dông", "weather-storm", "weather-storm-night"),
    96: ("Dông, mưa đá", "weather-storm", "weather-storm-night"),
    99: ("Dông, mưa đá", "weather-storm", "weather-storm-night"),
}


def log(message: str) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with LOG_FILE.open("a", encoding="utf-8") as handle:
            handle.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {message}\n")
    except OSError:
        pass


def load_config() -> dict[str, str]:
    config = dict(DEFAULT_CONFIG)
    try:
        if CONFIG_FILE.exists():
            for raw in CONFIG_FILE.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if key in config:
                    config[key] = value.strip().strip('"').strip("'")
    except OSError as exc:
        log(f"Không đọc được config: {exc}")
    return config


def fetch_weather(config: dict[str, str]) -> dict:
    params = {
        "latitude": config["LAT"],
        "longitude": config["LON"],
        "current": ",".join(
            [
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "is_day",
                "precipitation",
                "weather_code",
                "wind_speed_10m",
            ]
        ),
        "daily": "temperature_2m_max,temperature_2m_min,weather_code",
        "timezone": config["TIMEZONE"],
        "forecast_days": "1",
    }
    url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "MacTahoe-Conky-Weather/1.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.load(response)


def resolve_location(config: dict[str, str]) -> dict[str, str]:
    if config.get("LOCATION_MODE", "manual") != "auto":
        return config
    request = urllib.request.Request(
        "https://ipapi.co/json/",
        headers={"User-Agent": "MacTahoe-Widgets/1.0", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            location = json.load(response)
        latitude = location.get("latitude")
        longitude = location.get("longitude")
        city = location.get("city") or location.get("region") or location.get("country_name")
        if latitude is None or longitude is None or not city:
            raise ValueError("Dịch vụ định vị không trả về tọa độ và thành phố")
        resolved = dict(config)
        resolved.update(
            {
                "LAT": str(latitude),
                "LON": str(longitude),
                "CITY": str(city),
                "TIMEZONE": str(location.get("timezone") or "auto"),
            }
        )
        return resolved
    except Exception as exc:  # noqa: BLE001 - dùng vị trí đã lưu nếu dịch vụ định vị lỗi
        log(f"Không định vị được qua IP; dùng vị trí đã lưu: {exc}")
        return config


def read_cache() -> dict | None:
    try:
        with CACHE_FILE.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def write_cache(data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=CACHE_DIR, prefix=".weather-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
        os.replace(tmp_name, CACHE_FILE)
    finally:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass


def cache_age() -> float:
    try:
        return datetime.now().timestamp() - CACHE_FILE.stat().st_mtime
    except OSError:
        return 10**9


def make_icon(theme_dir: Path, icon_name: str) -> str:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    source = theme_dir / f"{icon_name}.svg"
    target = ICON_DIR / f"{icon_name}.png"
    if not source.exists():
        fallback = theme_dir / "weather-none-available.svg"
        if fallback.exists():
            source = fallback
        else:
            return ""
    try:
        if (
            not target.exists()
            or target.stat().st_mtime < source.stat().st_mtime
        ):
            subprocess.run(
                [
                    "rsvg-convert",
                    "-w",
                    "128",
                    "-h",
                    "128",
                    "-o",
                    str(target),
                    str(source),
                ],
                check=True,
                timeout=8,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        return str(target)
    except (OSError, subprocess.SubprocessError) as exc:
        log(f"Không tạo được icon {icon_name}: {exc}")
        return ""


def format_state(data: dict, config: dict[str, str]) -> dict[str, str]:
    current = data.get("current") or {}
    daily = data.get("daily") or {}
    code = int(current.get("weather_code", -1))
    is_day = int(current.get("is_day", 1)) == 1
    condition, day_icon, night_icon = WEATHER_CODES.get(
        code, ("Không rõ", "weather-none-available", "weather-none-available")
    )
    icon_name = day_icon if is_day else night_icon
    icon_path = make_icon(Path(config["ICON_THEME"]), icon_name)

    temp = current.get("temperature_2m")
    feels = current.get("apparent_temperature")
    humidity = current.get("relative_humidity_2m")
    wind = current.get("wind_speed_10m")
    high = (daily.get("temperature_2m_max") or [None])[0]
    low = (daily.get("temperature_2m_min") or [None])[0]

    time_text = str(current.get("time", ""))
    try:
        dt = datetime.fromisoformat(time_text)
    except ValueError:
        dt = datetime.now()
    date_text = f"{WEEKDAYS[dt.weekday()]}, {dt:%d/%m}"
    updated = f"{dt:%H:%M}"

    def round_value(value) -> str:
        try:
            return str(round(float(value)))
        except (TypeError, ValueError):
            return "--"

    state = {
        "city": config["CITY"],
        "temp": round_value(temp),
        "feels": round_value(feels),
        "high": round_value(high),
        "low": round_value(low),
        "humidity": round_value(humidity),
        "wind": round_value(wind),
        "condition": condition,
        "date": date_text,
        "updated": updated,
        "icon": icon_path,
        "code": str(code),
    }
    return state


def write_state(state: dict[str, str]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    lines = [f"{key}={value}" for key, value in state.items()]
    fd, tmp_name = tempfile.mkstemp(dir=CACHE_DIR, prefix=".weather-state-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write("\n".join(lines) + "\n")
        os.replace(tmp_name, STATE_FILE)
    finally:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass


def main() -> int:
    force = "--force" in sys.argv
    config = load_config()
    location_config = resolve_location(config)

    data = read_cache()
    if force or data is None or cache_age() > 600:
        try:
            data = fetch_weather(location_config)
            write_cache(data)
            log("Đã cập nhật thời tiết")
        except Exception as exc:  # noqa: BLE001 - widget không được chết vì mạng
            log(f"Lỗi lấy thời tiết: {exc}")
            if data is None:
                data = read_cache()

    if data is None:
        write_state(
            {
                "city": location_config["CITY"],
                "temp": "--",
                "feels": "--",
                "high": "--",
                "low": "--",
                "humidity": "--",
                "wind": "--",
                "condition": "Đang tải…",
                "date": "",
                "updated": "",
                "icon": "",
                "code": "-1",
            }
        )
        return 1

    try:
        state = format_state(data, location_config)
        write_state(state)
    except Exception as exc:  # noqa: BLE001
        log(f"Lỗi format thời tiết: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
