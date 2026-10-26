"""Test core nén ảnh."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image

from compressor import (
    CompressionSettings,
    compress_image,
    is_supported_image,
    target_dimensions,
)


class DimensionTests(unittest.TestCase):
    def test_keep_original_when_both_zero(self) -> None:
        self.assertEqual(target_dimensions(400, 200, 0, 0), (400, 200))

    def test_width_only_auto_height(self) -> None:
        self.assertEqual(target_dimensions(400, 200, 100, 0), (100, 50))

    def test_height_only_auto_width(self) -> None:
        self.assertEqual(target_dimensions(400, 200, 0, 100), (200, 100))

    def test_fit_inside_box(self) -> None:
        self.assertEqual(target_dimensions(400, 200, 100, 100), (100, 50))
        self.assertEqual(target_dimensions(300, 600, 100, 100), (50, 100))

    def test_never_upscale(self) -> None:
        self.assertEqual(target_dimensions(400, 200, 1200, 0), (400, 200))
        self.assertEqual(target_dimensions(400, 200, 0, 1200), (400, 200))


class CompressionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.png = self.root / "ảnh.png"
        self.jpg = self.root / "ảnh.jpg"
        self.webp = self.root / "ảnh.webp"

        Image.new("RGBA", (400, 200), (255, 0, 0, 255)).save(self.png)
        Image.new("RGB", (300, 600), (0, 128, 255)).save(self.jpg, quality=95)
        Image.new("RGB", (200, 100), (0, 200, 100)).save(self.webp, quality=95)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_width_only(self) -> None:
        result = compress_image(
            self.png,
            CompressionSettings(max_width=100, max_height=0, output_format="webp"),
        )
        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.output_size, (100, 50))
        self.assertEqual(result.output.suffix, ".webp")

    def test_height_only(self) -> None:
        result = compress_image(
            self.jpg,
            CompressionSettings(max_width=0, max_height=150, output_format="jpeg"),
        )
        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.output_size, (75, 150))

    def test_both_limits(self) -> None:
        result = compress_image(
            self.jpg,
            CompressionSettings(max_width=100, max_height=100, output_format="webp"),
        )
        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.output_size, (50, 100))

    def test_auto_format_keeps_source(self) -> None:
        result = compress_image(
            self.webp,
            CompressionSettings(output_format="auto"),
        )
        self.assertTrue(result.ok, result.error)
        self.assertEqual(result.output.suffix, ".webp")

    def test_png_to_jpeg_flattens_alpha(self) -> None:
        result = compress_image(
            self.png,
            CompressionSettings(output_format="jpeg", quality=80),
        )
        self.assertTrue(result.ok, result.error)
        with Image.open(result.output) as saved:
            self.assertEqual(saved.mode, "RGB")

    def test_supported_input(self) -> None:
        self.assertTrue(is_supported_image(self.png))
        self.assertTrue(is_supported_image(self.jpg))
        self.assertTrue(is_supported_image(self.webp))
        self.assertFalse(is_supported_image(self.root / "ảnh.gif"))


if __name__ == "__main__":
    unittest.main()
