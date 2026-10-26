"""Âm lịch Việt Nam.

Thuật toán chuyển đổi Dương lịch <-> Âm lịch dựa trên cách tính của
Hồ Ngọc Đức, dùng múi giờ Việt Nam UTC+7.

Phạm vi an toàn: khoảng 1800-2199.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from math import floor, radians, sin

TIMEZONE = 7.0
SYNODIC_MONTH = 29.530588853

CAN = ("Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý")
CHI = ("Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi")
WEEKDAYS = ("Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật")


@dataclass(frozen=True)
class LunarDate:
    day: int
    month: int
    year: int
    leap: bool = False

    @property
    def year_name(self) -> str:
        return can_chi_year(self.year)

    @property
    def month_name(self) -> str:
        return can_chi_month(self.year, self.month)

    @property
    def day_name(self) -> str:
        return can_chi_day(self.to_solar())

    def to_solar(self) -> date:
        return convert_lunar_to_solar(self.day, self.month, self.year, self.leap)

    def short_month(self) -> str:
        suffix = " nhuận" if self.leap else ""
        return f"tháng {self.month}{suffix}"


def jd_from_date(day: int, month: int, year: int) -> int:
    """Julian Day Number từ ngày Dương lịch."""
    a = (14 - month) // 12
    y = year + 4800 - a
    m = month + 12 * a - 3
    return (
        day
        + (153 * m + 2) // 5
        + 365 * y
        + y // 4
        - y // 100
        + y // 400
        - 32045
    )


def date_from_jd(jd: int) -> date:
    """Ngày Dương lịch từ Julian Day Number."""
    a = jd + 32044
    b = (4 * a + 3) // 146097
    c = a - (146097 * b) // 4
    d = (4 * c + 3) // 1461
    e = c - (1461 * d) // 4
    m = (5 * e + 2) // 153
    day = e - (153 * m + 2) // 5 + 1
    month = m + 3 - 12 * (m // 10)
    year = 100 * b + d - 4800 + m // 10
    return date(year, month, day)


def new_moon(k: int) -> float:
    """Thời điểm sóc thứ k (tính từ 1900-01-06), theo JD."""
    t = k / 1236.85
    jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * t * t
    jd1 -= 0.000000155 * t * t * t
    jd1 += 0.00033 * sin(radians(166.56 + 132.87 * t - 0.009173 * t * t))

    m = 359.2242 + 29.10535608 * k - 0.0000333 * t * t - 0.00000347 * t * t * t
    mpr = 306.0253 + 385.81691806 * k + 0.0107306 * t * t + 0.00001236 * t * t * t
    f = 21.2964 + 390.67050646 * k - 0.0016528 * t * t - 0.00000239 * t * t * t

    c1 = (0.1734 - 0.000393 * t) * sin(radians(m))
    c1 += 0.0021 * sin(radians(2 * m))
    c1 -= 0.4068 * sin(radians(mpr))
    c1 += 0.0161 * sin(radians(2 * mpr))
    c1 -= 0.0004 * sin(radians(3 * mpr))
    c1 += 0.0104 * sin(radians(2 * f))
    c1 -= 0.0051 * sin(radians(m + mpr))
    c1 -= 0.0074 * sin(radians(m - mpr))
    c1 += 0.0004 * sin(radians(2 * f + m))
    c1 -= 0.0004 * sin(radians(2 * f - m))
    c1 -= 0.0006 * sin(radians(2 * f + mpr))
    c1 += 0.0010 * sin(radians(2 * f - mpr))
    c1 += 0.0005 * sin(radians(m + 2 * mpr))

    if t < -11:
        deltat = 0.001 + 0.000839 * t + 0.0002261 * t * t
        deltat -= 0.00000845 * t * t * t - 0.000000081 * t * t * t * t
    else:
        deltat = -0.000278 + 0.000265 * t + 0.000262 * t * t

    return jd1 + c1 - deltat


def sun_longitude_degrees(jd: float) -> float:
    """Kinh độ Mặt Trời (độ) tại thời điểm JD."""
    t = (jd - 2451545.0) / 36525.0
    m = 357.52910 + 35999.05030 * t - 0.0001559 * t * t - 0.00000048 * t * t * t
    l0 = 280.46645 + 36000.76983 * t + 0.0003032 * t * t
    dl = (1.914600 - 0.004817 * t - 0.000014 * t * t) * sin(radians(m))
    dl += (0.019993 - 0.000101 * t) * sin(radians(2 * m))
    dl += 0.000290 * sin(radians(3 * m))
    l = l0 + dl
    l -= 360.0 * floor(l / 360.0)
    return l


def new_moon_day(k: int, timezone: float = TIMEZONE) -> int:
    return int(floor(new_moon(k) + 0.5 + timezone / 24.0))


def sun_longitude_term(day: int, timezone: float = TIMEZONE) -> int:
    """Tiết khí 0..11 tại nửa đêm địa phương."""
    return int(sun_longitude_degrees(day - 0.5 - timezone / 24.0) / 30.0)


def lunar_month_11(year: int, timezone: float = TIMEZONE) -> int:
    """Ngày bắt đầu tháng 11 âm lịch của năm Dương lịch."""
    off = jd_from_date(31, 12, year) - 2415021
    k = int(floor(off / SYNODIC_MONTH))
    nm = new_moon_day(k, timezone)
    if sun_longitude_term(nm, timezone) >= 9:
        nm = new_moon_day(k - 1, timezone)
    return nm


def leap_month_offset(a11: int, timezone: float = TIMEZONE) -> int:
    k = int(floor((a11 - 2415021.076998695) / SYNODIC_MONTH + 0.5))
    last = 0
    i = 1
    arc = sun_longitude_term(new_moon_day(k + i, timezone), timezone)
    while arc != last and i < 14:
        last = arc
        i += 1
        arc = sun_longitude_term(new_moon_day(k + i, timezone), timezone)
    return i - 1


def convert_solar_to_lunar(d: date, timezone: float = TIMEZONE) -> LunarDate:
    day_number = jd_from_date(d.day, d.month, d.year)
    k = int(floor((day_number - 2415021.076998695) / SYNODIC_MONTH))
    month_start = new_moon_day(k + 1, timezone)
    if month_start > day_number:
        month_start = new_moon_day(k, timezone)

    a11 = lunar_month_11(d.year, timezone)
    b11 = a11
    if a11 >= month_start:
        lunar_year = d.year
        a11 = lunar_month_11(d.year - 1, timezone)
    else:
        lunar_year = d.year + 1
        b11 = lunar_month_11(d.year + 1, timezone)

    lunar_day = day_number - month_start + 1
    diff = int((month_start - a11) / 29)
    leap = False
    lunar_month = diff + 11

    if b11 - a11 > 365:
        leap_month_diff = leap_month_offset(a11, timezone)
        if diff >= leap_month_diff:
            lunar_month = diff + 10
            if diff == leap_month_diff:
                leap = True

    if lunar_month > 12:
        lunar_month -= 12
    if lunar_month >= 11 and diff < 4:
        lunar_year -= 1

    return LunarDate(lunar_day, lunar_month, lunar_year, leap)


def convert_lunar_to_solar(
    lunar_day: int,
    lunar_month: int,
    lunar_year: int,
    lunar_leap: bool = False,
    timezone: float = TIMEZONE,
) -> date:
    if not (1 <= lunar_month <= 12 and 1 <= lunar_day <= 30):
        raise ValueError("Ngày/tháng âm lịch không hợp lệ")

    if lunar_month < 11:
        a11 = lunar_month_11(lunar_year - 1, timezone)
        b11 = lunar_month_11(lunar_year, timezone)
    else:
        a11 = lunar_month_11(lunar_year, timezone)
        b11 = lunar_month_11(lunar_year + 1, timezone)

    k = int(floor((a11 - 2415021.076998695) / SYNODIC_MONTH + 0.5))
    off = lunar_month - 11
    if off < 0:
        off += 12

    if b11 - a11 > 365:
        leap_off = leap_month_offset(a11, timezone)
        leap_month = leap_off - 2
        if leap_month < 0:
            leap_month += 12
        if lunar_leap and lunar_month != leap_month:
            raise ValueError("Tháng này không phải tháng nhuận")
        if lunar_leap or off >= leap_off:
            off += 1

    month_start = new_moon_day(k + off, timezone)
    return date_from_jd(month_start + lunar_day - 1)


def can_chi_year(lunar_year: int) -> str:
    return CAN[(lunar_year - 4) % 10] + " " + CHI[(lunar_year - 4) % 12]


def can_chi_month(lunar_year: int, lunar_month: int) -> str:
    year_can = (lunar_year - 4) % 10
    month_can = (year_can * 2 + lunar_month + 1) % 10
    month_chi = (lunar_month + 1) % 12
    return CAN[month_can] + " " + CHI[month_chi]


def can_chi_day(d: date) -> str:
    jd = jd_from_date(d.day, d.month, d.year)
    return CAN[(jd + 9) % 10] + " " + CHI[(jd + 1) % 12]


def lunar_day_label(lunar: LunarDate) -> str:
    if lunar.day == 1:
        suffix = "n" if lunar.leap else ""
        return f"1/{lunar.month}{suffix}"
    if lunar.day == 15:
        return "Rằm"
    return str(lunar.day)


def lunar_long_label(lunar: LunarDate) -> str:
    if lunar.day == 1:
        day_text = "Mùng 1"
    elif lunar.day == 15:
        day_text = "Rằm"
    elif lunar.day == 30:
        day_text = "Ba mươi"
    else:
        day_text = f"Ngày {lunar.day}"
    suffix = " nhuận" if lunar.leap else ""
    return f"{day_text} tháng {lunar.month}{suffix} năm {lunar.year_name}"
