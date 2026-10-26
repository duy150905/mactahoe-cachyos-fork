"""Các ngày lễ, ngày kỷ niệm thường gặp trên lịch Việt Nam."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from lunar import LunarDate, convert_solar_to_lunar


@dataclass(frozen=True)
class Holiday:
    short: str
    name: str


SOLAR_HOLIDAYS: dict[tuple[int, int], Holiday] = {
    (1, 1): Holiday("Tết DL", "Tết Dương lịch"),
    (3, 8): Holiday("8/3", "Quốc tế Phụ nữ"),
    (4, 30): Holiday("30/4", "Ngày Giải phóng miền Nam"),
    (5, 1): Holiday("1/5", "Quốc tế Lao động"),
    (6, 1): Holiday("1/6", "Quốc tế Thiếu nhi"),
    (7, 27): Holiday("27/7", "Ngày Thương binh - Liệt sĩ"),
    (9, 2): Holiday("2/9", "Quốc khánh"),
    (10, 20): Holiday("20/10", "Ngày Phụ nữ Việt Nam"),
    (11, 20): Holiday("20/11", "Ngày Nhà giáo Việt Nam"),
    (12, 22): Holiday("22/12", "Ngày thành lập Quân đội nhân dân Việt Nam"),
}

LUNAR_HOLIDAYS: dict[tuple[int, int], Holiday] = {
    (1, 1): Holiday("Tết", "Tết Nguyên Đán"),
    (1, 15): Holiday("Rằm", "Rằm tháng Giêng"),
    (3, 3): Holiday("Hàn Thực", "Tết Hàn Thực"),
    (3, 10): Holiday("Giỗ Tổ", "Giỗ Tổ Hùng Vương"),
    (5, 5): Holiday("Đoan Ngọ", "Tết Đoan Ngọ"),
    (7, 15): Holiday("Vu Lan", "Lễ Vu Lan"),
    (8, 15): Holiday("Trung Thu", "Tết Trung Thu"),
    (12, 23): Holiday("Ông Táo", "Ông Công - Ông Táo"),
}


def get_holidays(d: date, lunar: LunarDate) -> list[Holiday]:
    """Trả về các ngày lễ của một ngày Dương lịch."""
    result: list[Holiday] = []

    solar = SOLAR_HOLIDAYS.get((d.month, d.day))
    if solar:
        result.append(solar)

    if not lunar.leap:
        lunar_holiday = LUNAR_HOLIDAYS.get((lunar.month, lunar.day))
        if lunar_holiday:
            result.append(lunar_holiday)

    # Giao thừa là ngày cuối cùng của năm âm lịch, ngay trước mùng 1 tháng Giêng.
    try:
        tomorrow = convert_solar_to_lunar(d + timedelta(days=1))
        if tomorrow.day == 1 and tomorrow.month == 1 and not tomorrow.leap:
            result.append(Holiday("Giao thừa", "Đêm Giao thừa"))
    except (ValueError, OverflowError):
        pass

    return result
