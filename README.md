<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/ddba93bb-4a69-493c-8a72-94bc8b657788" />


# mactahoe-setup

Mấy file mình dùng để dựng lại giao diện kiểu macOS Tahoe trên GNOME (CachyOS/Arch). Cài máy mới, đỡ phải ngồi chỉnh từng thứ một. Chép theme, icon, font, extension, widget Conky và thiết lập GNOME về đúng chỗ, chạy một script là xong.

Chụp từ máy của mình: CachyOS, GNOME Shell 51 (xem `manifest.env`). Khác bản GNOME thì extension có thể hỏng, script sẽ cảnh báo chứ không chặn.

## Cài

```bash
git clone https://github.com/duy150905/mactahoe-cachyos-fork.git
cd mactahoe-cachyos-fork

bash install.sh --dry-run    # chạy thử, chỉ in ra chứ không đụng gì
bash install.sh              # cài thật, sẽ hỏi mật khẩu sudo để cài gói pacman
```

Xong thì đăng xuất rồi đăng nhập lại là thấy.

Vài điều nhớ giúp:

- Chạy bằng user thường, đừng `sudo bash install.sh`. Script cần quyền sudo thì tự hỏi.
- Chạy trong terminal của phiên GNOME đang đăng nhập (cần D-Bus session).
- Chỉ chạy được trên Arch/CachyOS, và phải có sẵn GNOME Shell.
- Đã có gói rồi, chỉ muốn chép cấu hình thì thêm `--skip-packages`.

Các cờ khác: `--with-aur` (cài thêm gói AUR, cần `paru` hoặc `yay`), `--with-flatpak`, `--no-dconf` (không đụng thiết lập GNOME), `--no-firefox`.

## Cài hỏng thì sao

Trước khi chép gì, script tự sao lưu những thư mục sẽ bị ghi đè vào `~/.local/state/mactahoe-restore/` (kèm bản dump dconf). Muốn quay lại:

```bash
./uninstall.sh --dry-run   # xem trước
./uninstall.sh             # xóa file đã chép, nạp lại bản sao lưu cũ nhất, reset dconf
```

Gói pacman đã cài thì không bị gỡ. Log mỗi lần cài nằm cùng thư mục đó.

## Trong repo có gì

```
install.sh / uninstall.sh      script chính
manifest.env                   thông tin máy gốc (user, distro, bản GNOME Shell)
paths.txt                      những đường dẫn trong ~ sẽ được sao lưu và ghi đè
packages-theme.txt             gói pacman sẽ cài
packages-foreign.txt           gói AUR (chỉ cài khi có --with-aur)
packages-explicit.txt          toàn bộ gói mình từng cài tay, chỉ để tham khảo
flatpak-apps.txt               app Flatpak (chỉ cài khi có --with-flatpak)
units-enabled.txt              service systemd --user sẽ được bật
extensions.tsv                 extension nào bật/tắt trên máy gốc
dconf/gnome.ini                thiết lập GNOME
dconf/skipped-sections.txt     các mục dconf cố ý bỏ ra ngoài (chỉ để xem)
firefox/                       trống, bước Firefox sẽ tự bỏ qua
hooks/post-install.example.sh  mẫu để chạy lệnh riêng sau khi cài
files/                         thứ sẽ được chép vào $HOME, giữ nguyên cấu trúc thư mục
```

Trong `files/`:

```
.themes/                       theme MacTahoe (Light/Dark, solid, hdpi, xhdpi)
.config/gtk-3.0, gtk-4.0/      settings, css, bookmarks
.config/conky/                 6 widget + file lua vẽ
.config/systemd/user/          color-scheme-sync.service
.local/bin/                    các script nhỏ (kể bên dưới)
.local/share/applications/     launcher .desktop
.local/share/backgrounds/      hình nền
.local/share/fonts/            SF Pro, SF Mono, Nerd Font, vài font lẻ
.local/share/icons/            con trỏ chuột MacTahoe
.local/share/gnome-shell/extensions/   CachyOSTahoe, CachyOSTahoeDock, blur-my-shell, moveclock
.local/share/mactahoe-apps/    hai app Python: âm lịch, nén ảnh
.local/share/mactahoe-widgets/ lunar.py cho widget âm lịch
```

Cả repo khoảng 200 MB, gần hết là icon/con trỏ, theme và font.

Mấy script trong `.local/bin/`:

- `mactahoe-widgets`: giao diện bật/tắt widget, chọn thành phố cho thời tiết, chọn màu đồng hồ lớn. Có lệnh `start|stop|restart|status|color [màu]`.
- `mactahoe-cava-feed`: chạy `cava` và ghi dữ liệu sóng nhạc cho widget Sóng nhạc (do `mactahoe-widgets` tự gọi).
- `mactahoe-weather-fetch.py`: lấy thời tiết từ Open-Meteo, Conky gọi 10 phút một lần.
- `mactahoe-lunar-fetch.py`: tạo dữ liệu âm lịch cho widget.
- `color-scheme-sync.sh`: theo dõi `color-scheme` của GNOME rồi tự đổi theme GTK/Shell giữa Light và Dark.
- `mactahoe-icon-manager`: app GTK4 đổi icon cho từng ứng dụng.
- `gnome-theme-switcher`, `am-lich-viet-nam`, `image-compressor`: đúng như tên.

## Muốn chỉnh gì thì chỉnh ở đâu

**Gói cài.** Sửa thẳng `packages-theme.txt` (mỗi dòng một gói, `#` là comment). `packages-foreign.txt` chủ yếu là app cá nhân của mình (Chrome, VS Code, Spotify, WPS...), không liên quan giao diện, nên coi trước rồi hãy dùng `--with-aur`.

**Cái gì được chép.** `paths.txt`. Xóa một dòng là phần đó khỏi bị ghi đè, ví dụ bỏ `.local/share/backgrounds` nếu bạn muốn giữ hình nền của mình.

**Thiết lập GNOME.** `dconf/gnome.ini`. Mấy chỗ hay đụng tới:

- hình nền: `picture-uri`, `picture-uri-dark`
- `gtk-theme`, `icon-theme`, `cursor-theme`, `cursor-size`, `accent-color`
- `color-scheme`: `default` là sáng, `prefer-dark` là tối
- `font-name`, `monospace-font-name`, `text-scaling-factor`
- `button-layout`: nút đóng/thu nhỏ/phóng to đang để bên trái
- `favorite-apps`: app ghim trên dock (app chưa cài sẽ tự bị lọc bỏ)
- độ mờ của blur-my-shell (`sigma`, `brightness`, `unscaled_radius`)
- thanh trên cùng: `clock-position`, `clock-offset`, `hide-activities`
- dock: `click-action`, `dash-max-icon-size`

Khi `color-scheme-sync` đang chạy thì `gtk-theme` và `user-theme` bị nó đổi theo sáng/tối, nên muốn đổi sáng/tối cứ đổi `color-scheme`, đừng sửa tên theme.

**Thời tiết.** Nằm ở `~/.config/mactahoe-widgets/weather.conf`, không có sẵn trong repo, sinh ra khi bạn dùng `mactahoe-widgets`. Các khóa: `LAT`, `LON`, `CITY`, `TIMEZONE`, `LOCATION_MODE` (`manual` hoặc `auto` dò theo IP qua ipapi.co) và `ICON_THEME`. Đặt bằng giao diện cho nhanh, có ô tìm tên thành phố. Nếu để mặc định thì `mactahoe-weather-fetch.py` dùng Hà Nội, còn `mactahoe-widgets` dùng Quy Nhơn (mình quên đồng bộ hai chỗ này).

**Widget Conky.** `files/.config/conky/mactahoe-*.conf`. Mỗi widget một file, chỉnh `alignment`, `gap_x`/`gap_y`, độ rộng, `font`, `update_interval`. Vị trí hiện tính cho màn hình của mình; `mactahoe-widgets` có tự xếp lại khi bật/tắt. Đừng sửa `output_backend = 'x11'`, bỏ nó đi thì Conky bản mới trên Wayland dễ crash.

**Màu đồng hồ lớn.** Chọn trong giao diện `mactahoe-widgets` (mục "Màu đồng hồ lớn") hoặc chạy `mactahoe-widgets color purple`. Lựa chọn lưu ở `~/.cache/mactahoe-widgets/clock_theme.txt`, đổi là áp dụng ngay.

**Tự bật khi đăng nhập.** `files/.config/autostart/mactahoe-widgets.desktop` chạy `mactahoe-widgets start` sau khi vào phiên GNOME khoảng 3 giây, bật đúng các widget đang được chọn (mặc định là tất cả). Muốn tắt: xóa file này trong `~/.config/autostart/`.

**GTK.** `files/.config/gtk-3.0/` và `gtk-4.0/`: `settings.ini` (theme, icon, font, con trỏ), `bookmarks` (thư mục ghim trong file manager), và vài file css để chỉnh màu.

**Service tự bật.** `units-enabled.txt`, hiện chỉ có `color-scheme-sync.service`.

**Lệnh riêng sau khi cài.** Đổi `hooks/post-install.example.sh` thành `post-install.sh`, thêm lệnh của bạn, script sẽ chạy nó ở cuối.

**Firefox.** Bỏ thư mục chứa `chrome/` và/hoặc `user.js` vào `firefox/`, script sẽ chép vào mọi profile tìm thấy (có sao lưu bản cũ). Hiện để trống nên bước này bị bỏ qua.

## Một số chỗ chưa ổn

Để khỏi ai đó clone về rồi bối rối:

- Icon theme `MacTahoe-blue` được nhắc ở `gnome.ini`, `settings.ini` và script thời tiết, nhưng trong `files/.local/share/icons/` không có thư mục nào như vậy. Mấy thư mục `MacTahoe` và `MacTahoe-light` ở đó thực ra là con trỏ chuột (không có `index.theme`). Máy mới cần tự cài icon theme MacTahoe, hoặc đổi tên icon theme trong mấy file trên sang cái bạn đang có.
- Một số extension (như dash-to-dock) trên máy gốc cài từ AUR hoặc extensions.gnome.org. Thiếu thì script chỉ cảnh báo, bạn tự cài.
- Repo có font SF Pro / SF Mono của Apple, và `packages-foreign.txt` có `ttf-ms-fonts`, `wps-office`. Nhớ tự xem lại giấy phép nếu định công khai.
- Một vài thứ mang dấu vết cá nhân của mình: `manifest.env` (tên user), hình nền, danh sách gói, `favorite-apps`. Fork về thì dọn lại cho đúng ý bạn.
- Script không đụng tới hệ thống ngoài `~` (`/etc`, GDM, kernel...), cũng không mang theo tài khoản hay mật khẩu.
