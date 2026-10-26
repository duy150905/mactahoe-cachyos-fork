# Âm lịch Việt Nam

Ứng dụng lịch âm viết bằng Python + GTK4/Adw, giao diện tối theo phong cách macOS của bộ MacTahoe.

## Chức năng

- Lịch tháng Dương lịch kèm ngày âm, tháng nhuận và Can Chi.
- Xem chi tiết ngày đang chọn: Dương lịch, Âm lịch, Can Chi năm/tháng/ngày.
- Đánh dấu ngày lễ, ngày kỷ niệm Việt Nam (Tết, Giỗ Tổ, Trung Thu, 2/9, 20/10…).
- Nút **Hôm nay**, chuyển tháng bằng chuột hoặc bàn phím.
- Chạy hoàn toàn offline, không cần mạng.

## Chạy

```bash
cd "$HOME/mactahoe-cachyos/apps/am-lich-viet-nam"
python3 amlich_app.py
```

Hoặc bấm biểu tượng **Âm lịch Việt Nam** trong ứng dụng GNOME. Lệnh đã cài:

```bash
am-lich-viet-nam
```

## Phím tắt

| Phím | Tác dụng |
|---|---|
| `←` / `Page Up` | Tháng trước |
| `→` / `Page Down` | Tháng sau |
| `Home` / `Ctrl+T` | Về hôm nay |

## Cấu trúc

- `amlich_app.py` — giao diện GTK4.
- `lunar.py` — thuật toán chuyển đổi Dương lịch/Âm lịch của Hồ Ngọc Đức, múi giờ UTC+7.
- `holidays.py` — danh sách ngày lễ, ngày kỷ niệm.
- `style.css` — giao diện macOS.
- `assets/vn.ihoan.AmLich.svg` — biểu tượng ứng dụng.
- `test_lunar.py` — kiểm tra thuật toán và ngày lễ.

## Kiểm tra

```bash
cd "$HOME/mactahoe-cachyos/apps/am-lich-viet-nam"
python3 -m unittest -v test_lunar.py
```

## Ghi chú

- Thuật toán dùng múi giờ Việt Nam UTC+7, hỗ trợ tốt khoảng năm 1800–2199.
- Tháng nhuận được tính tự động; ngày lễ âm lịch không áp dụng cho tháng nhuận.
- Ngày Can Chi tính theo Julian Day Number; tháng Can Chi theo Can của năm âm lịch.
