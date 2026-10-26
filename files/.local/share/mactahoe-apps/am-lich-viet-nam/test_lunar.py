"""Kiểm tra nhanh thuật toán âm lịch và dữ liệu ngày lễ."""

from __future__ import annotations

import random
import unittest
from datetime import date

from holidays import get_holidays
from lunar import LunarDate, convert_lunar_to_solar, convert_solar_to_lunar


class LunarAlgorithmTests(unittest.TestCase):
    def test_known_tet_dates(self) -> None:
        for solar, year_name in (
            (date(2023, 1, 22), "Quý Mão"),
            (date(2024, 2, 10), "Giáp Thìn"),
            (date(2025, 1, 29), "Ất Tỵ"),
            (date(2026, 2, 17), "Bính Ngọ"),
        ):
            lunar = convert_solar_to_lunar(solar)
            self.assertEqual((lunar.day, lunar.month, lunar.leap), (1, 1, False))
            self.assertEqual(lunar.year_name, year_name)
            self.assertEqual(lunar.to_solar(), solar)

    def test_mid_autumn_2026(self) -> None:
        lunar = convert_solar_to_lunar(date(2026, 9, 25))
        self.assertEqual((lunar.day, lunar.month), (15, 8))
        self.assertEqual(lunar.year, 2026)

    def test_known_leap_months(self) -> None:
        expected = {
            2020: 4,
            2023: 2,
            2025: 6,
            2028: 5,
        }
        for year, leap_month in expected.items():
            found = False
            for solar in (date(year, 1, 1).toordinal() + offset for offset in range(370)):
                lunar = convert_solar_to_lunar(date.fromordinal(solar))
                if lunar.year == year and lunar.leap:
                    self.assertEqual(lunar.month, leap_month)
                    found = True
                    break
            self.assertTrue(found, f"Không tìm thấy tháng nhuận năm {year}")

    def test_leap_month_round_trip(self) -> None:
        for lunar in (LunarDate(1, 6, 2025, True), LunarDate(15, 6, 2025, True)):
            solar = lunar.to_solar()
            self.assertEqual(convert_solar_to_lunar(solar), lunar)

    def test_random_round_trips(self) -> None:
        rng = random.Random(20261020)
        for _ in range(3000):
            year = rng.randint(1800, 2199)
            month = rng.randint(1, 12)
            day = rng.randint(1, 28)
            solar = date(year, month, day)
            lunar = convert_solar_to_lunar(solar)
            self.assertEqual(lunar.to_solar(), solar)

    def test_current_lunar_date(self) -> None:
        lunar = convert_solar_to_lunar(date(2026, 10, 20))
        self.assertEqual((lunar.day, lunar.month, lunar.year), (11, 9, 2026))


class HolidayTests(unittest.TestCase):
    def test_vietnamese_womens_day(self) -> None:
        solar = date(2026, 10, 20)
        names = [h.name for h in get_holidays(solar, convert_solar_to_lunar(solar))]
        self.assertIn("Ngày Phụ nữ Việt Nam", names)

    def test_tet_and_new_year_eve(self) -> None:
        tet = date(2026, 2, 17)
        tet_names = [h.name for h in get_holidays(tet, convert_solar_to_lunar(tet))]
        self.assertIn("Tết Nguyên Đán", tet_names)

        eve = date(2026, 2, 16)
        eve_names = [h.name for h in get_holidays(eve, convert_solar_to_lunar(eve))]
        self.assertIn("Đêm Giao thừa", eve_names)

    def test_hung_kings_day(self) -> None:
        solar = convert_lunar_to_solar(10, 3, 2026)
        names = [h.name for h in get_holidays(solar, convert_solar_to_lunar(solar))]
        self.assertIn("Giỗ Tổ Hùng Vương", names)


if __name__ == "__main__":
    unittest.main()
