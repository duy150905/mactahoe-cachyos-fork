<img width="1920" height="1080" alt="MacTahoe trên CachyOS" src="https://github.com/user-attachments/assets/ddba93bb-4a69-493c-8a72-94bc8b657788" />

# MacTahoe cho CachyOS

Bộ cài dựng giao diện kiểu macOS Tahoe trên GNOME (CachyOS/Arch): theme GTK, con trỏ, extension, widget Conky và thiết lập GNOME. Một lệnh để cài, một lệnh để gỡ.

Được kiểm tra trên CachyOS với GNOME Shell 51 (xem `data/manifest.env`). Khác phiên bản GNOME thì extension có thể không chạy; `install.sh` sẽ cảnh báo nhưng không chặn.

## Yêu cầu

- CachyOS hoặc Arch Linux, đã cài GNOME Shell.
- Chạy trong terminal của phiên GNOME đang đăng nhập (cần D-Bus session), bằng tài khoản thường. Không dùng `sudo bash install.sh`; script tự hỏi sudo khi cần cài gói.

## Cài đặt

```bash
git clone https://github.com/duy150905/mactahoe-cachyos-fork.git
cd mactahoe-cachyos-fork

./install.sh --dry-run    # chạy thử, chỉ in ra, không thay đổi gì
./install.sh              # cài thật
```

Đăng xuất rồi đăng nhập lại để GNOME nạp theme và extension.

| Cờ | Tác dụng |
| --- | --- |
| `--dry-run` | Chỉ hiển thị các bước, không thay đổi gì |
| `--skip-packages` | Không cài gói pacman, chỉ chép cấu hình |
| `--no-dconf` | Không nạp thiết lập GNOME |

## Gỡ cài đặt

Trước khi ghi đè, `install.sh` sao lưu các đường dẫn trong `data/paths.txt` và dump dconf vào `~/.local/state/mactahoe-restore/`. Để quay lại trạng thái cũ:

```bash
./uninstall.sh --dry-run   # xem trước
./uninstall.sh             # xóa file đã chép, khôi phục bản sao lưu, reset dconf
```

Gói pacman đã cài không bị gỡ. Log của mỗi lần cài nằm trong cùng thư mục sao lưu.

## Cấu trúc

```
install.sh, uninstall.sh   script chính
data/
  manifest.env             môi trường đã kiểm tra (distro, bản GNOME Shell)
  paths.txt                đường dẫn trong ~ sẽ được sao lưu và ghi đè
  packages.txt             gói pacman sẽ cài
  extensions.tsv           extension cần bật
  units-enabled.txt        service systemd --user sẽ được bật
dconf/gnome.ini            thiết lập GNOME
hooks/                     mẫu lệnh chạy riêng sau khi cài
files/                     nội dung chép vào $HOME, giữ nguyên cấu trúc
```

Trong `files/`:

```
.themes/                               MacTahoe (Light/Dark, solid)
.config/gtk-3.0, gtk-4.0/              settings, css, bookmarks
.config/conky/                         6 widget và file lua vẽ
.config/systemd/user/                  color-scheme-sync.service
.local/bin/                            các script nhỏ (bên dưới)
.local/share/applications/             launcher .desktop
.local/share/backgrounds/              hình nền mặc định
.local/share/fonts/                    Nerd Font và vài font lẻ
.local/share/icons/                    con trỏ MacTahoe, icon theme WhiteSur
.local/share/gnome-shell/extensions/   CachyOSTahoe, CachyOSTahoeDock, blur-my-shell, moveclock
.local/share/mactahoe-apps/            hai app Python: âm lịch, nén ảnh
.local/share/mactahoe-widgets/         lunar.py cho widget âm lịch
```

Các script trong `.local/bin/`:

- `mactahoe-widgets`: giao diện bật/tắt widget, chọn thành phố thời tiết, chọn màu đồng hồ lớn. Lệnh: `start|stop|restart|status|color [màu]`.
- `mactahoe-cava-feed`: chạy `cava` và ghi dữ liệu cho widget sóng nhạc (do `mactahoe-widgets` gọi).
- `mactahoe-weather-fetch.py`: lấy thời tiết từ Open-Meteo, Conky gọi 10 phút một lần.
- `mactahoe-lunar-fetch.py`: tạo dữ liệu âm lịch cho widget.
- `color-scheme-sync.sh`: theo dõi `color-scheme` của GNOME và đổi theme GTK/Shell giữa Light và Dark.
- `mactahoe-icon-manager`: app GTK4 đổi icon cho từng ứng dụng.
- `gnome-theme-switcher`, `am-lich-viet-nam`, `image-compressor`: đúng như tên.

## Tùy chỉnh

**Gói cài.** Sửa `data/packages.txt` (mỗi dòng một gói, `#` là comment).

**Cái gì được chép.** Sửa `data/paths.txt`. Xóa một dòng để phần đó không bị ghi đè, ví dụ bỏ `.local/share/backgrounds` nếu muốn giữ hình nền của bạn.

**Thiết lập GNOME.** Sửa `dconf/gnome.ini`. Các khóa hay chỉnh:

- hình nền: `picture-uri`, `picture-uri-dark`
- `gtk-theme`, `icon-theme`, `cursor-theme`, `cursor-size`, `accent-color`
- `color-scheme`: `default` là sáng, `prefer-dark` là tối
- `font-name`, `monospace-font-name`, `text-scaling-factor`
- `button-layout`: nút đóng/thu nhỏ/phóng to đang ở bên trái
- `favorite-apps`: app ghim trên dock (app chưa cài sẽ tự bị lọc bỏ)
- độ mờ của blur-my-shell: `sigma`, `brightness`, `unscaled_radius`
- thanh trên cùng: `clock-position`, `clock-offset`, `hide-activities`
- dock: `click-action`, `dash-max-icon-size`

Khi `color-scheme-sync` đang chạy, `gtk-theme` và `user-theme` bị nó đổi theo sáng/tối. Muốn đổi sáng/tối thì đổi `color-scheme`, đừng sửa tên theme.

**Font.** Giao diện dùng Inter và JetBrains Mono (gói `inter-font`, `ttf-jetbrains-mono`). Đổi font trong `dconf/gnome.ini`, `files/.config/gtk-{3,4}.0/settings.ini` và các file `files/.config/conky/mactahoe-*.conf`.

**Thời tiết.** Cấu hình ở `~/.config/mactahoe-widgets/weather.conf`, được tạo khi dùng `mactahoe-widgets`. Các khóa: `LAT`, `LON`, `CITY`, `TIMEZONE`, `LOCATION_MODE` (`manual` hoặc `auto` dò theo IP qua ipapi.co), `ICON_THEME`. Mặc định là Hà Nội. Nên đặt bằng giao diện, có ô tìm tên thành phố.

**Widget Conky.** `files/.config/conky/mactahoe-*.conf`, mỗi widget một file: `alignment`, `gap_x`/`gap_y`, độ rộng, `font`, `update_interval`. Vị trí được căn theo màn hình của máy gốc; `mactahoe-widgets` tự xếp lại khi bật/tắt, nếu lệch thì chỉnh `gap_x`/`gap_y`. Giữ nguyên `output_backend = 'x11'`: bỏ đi thì Conky bản mới trên Wayland dễ crash.

**Màu đồng hồ lớn.** Chọn trong giao diện `mactahoe-widgets` hoặc chạy `mactahoe-widgets color purple`. Lựa chọn lưu ở `~/.cache/mactahoe-widgets/clock_theme.txt` và áp dụng ngay.

**Tự bật widget khi đăng nhập.** `files/.config/autostart/mactahoe-widgets.desktop`. Muốn tắt, xóa file này trong `~/.config/autostart/`.

**Lệnh riêng sau khi cài.** Đổi `hooks/post-install.example.sh` thành `hooks/post-install.sh` và thêm lệnh của bạn; `install.sh` chạy nó ở cuối. File này đã được `.gitignore` bỏ qua.

## Lưu ý

- **Icon theme.** `dconf/gnome.ini` và `settings.ini` trỏ tới icon theme `MacTahoe-blue`, nhưng bộ cài không kèm theo. Hãy cài nó riêng, hoặc đổi `icon-theme` sang theme bạn có (repo có sẵn `WhiteSur-dark` và `WhiteSur-light`). `install.sh` sẽ cảnh báo nếu không tìm thấy.
- **Extension hệ thống** (`user-theme`, `system-monitor`...) nằm trong gói `gnome-shell-extensions`, đã có trong `data/packages.txt`.
- **Hình nền.** `files/.local/share/backgrounds/mactahoe-default.jpg` là hình nền mặc định. `files/Wallpapers/` không được cài tự động. Cả hai chưa ghi rõ nguồn và giấy phép; hãy thay bằng ảnh của bạn nếu định phân phối lại.
- Script chỉ thao tác trong `~`, không đụng tới `/etc`, GDM hay kernel, và không mang theo tài khoản hay mật khẩu.

## Ghi công

- Theme GTK, icon và con trỏ MacTahoe, icon WhiteSur: [vinceliuice](https://github.com/vinceliuice).
- Extension CachyOSTahoe và CachyOSTahoeDock: dựa trên [adfoxtheme/mactahoe-ubuntu](https://github.com/adfoxtheme/mactahoe-ubuntu).
- [Blur my Shell](https://github.com/aunetx/blur-my-shell) của aunetx.
- [moveclock](https://github.com/kuvaus/moveclock) của kuvaus.

## Giấy phép

Mã nguồn của repo theo GNU GPL v3 (xem `LICENSE`). Các thành phần bên thứ ba (theme, icon, font, extension) giữ giấy phép riêng của từng dự án.
