# Nén ảnh

Ứng dụng GTK4/Adw để nén một hoặc nhiều ảnh, giao diện tối theo phong cách macOS.

## Chức năng

- Chọn nhiều ảnh cùng lúc hoặc kéo thả vào cửa sổ.
- Hỗ trợ đầu vào **PNG, JPG/JPEG, WebP**.
- Xuất ảnh sang **WebP, JPEG, PNG**, hoặc giữ định dạng gốc.
- Giới hạn chiều ngang/chiều dọc:
  - Cả hai bằng `0`: giữ nguyên kích thước.
  - Một cạnh bằng `0`: cạnh còn lại là giới hạn, cạnh kia tự tính theo tỉ lệ.
  - Cả hai > `0`: ảnh vừa trong khung, giữ đúng tỉ lệ.
  - Không tự phóng to ảnh nhỏ hơn giới hạn.
- Thanh chất lượng cho JPG/WebP; PNG nén không mất dữ liệu.
- Tự tạo tên mới, không ghi đè ảnh cũ.
- Hiển thị kích thước và dung lượng trước/sau khi nén.
- Chạy offline, không upload ảnh.

## Chạy

```bash
cd "$HOME/mactahoe-cachyos/apps/image-compressor"
python3 app.py
```

Hoặc bấm biểu tượng **Nén ảnh** trong GNOME. Lệnh đã cài:

```bash
image-compressor
```

## Cấu trúc

- `app.py` — giao diện GTK4.
- `compressor.py` — xử lý ảnh bằng Pillow.
- `style.css` — giao diện macOS.
- `assets/vn.ihoan.ImageCompressor.svg` — biểu tượng ứng dụng.
- `test_compressor.py` — test kích thước, định dạng, alpha và batch.

## Kiểm tra

```bash
cd "$HOME/mactahoe-cachyos/apps/image-compressor"
python3 -m unittest -v test_compressor.py
```

## Ghi chú

- Ảnh được xử lý tuần tự trong luồng nền, giao diện không bị treo khi nén nhiều ảnh.
- JPEG không có alpha; ảnh PNG/WebP trong suốt sẽ được đặt trên nền trắng khi xuất JPEG.
- Ảnh động (animated WebP) hiện chỉ xử lý khung hình đầu tiên.
- Mặc định lưu vào `~/Pictures/Ảnh đã nén`.
