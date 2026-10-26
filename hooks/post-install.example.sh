#!/usr/bin/env bash
# Đổi tên file này thành post-install.sh để install.sh tự chạy nó SAU khi khôi phục xong.
# Dán vào đây các lệnh sửa lỗi bạn từng chạy tay (xem review/commands-seen.txt nếu đã
# capture với --with-history). Ví dụ (bỏ comment nếu cần):
#
# gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
# systemctl --user enable --now color-scheme-sync.service
# fish -c 'fish_add_path ~/.local/bin'
set -Eeuo pipefail
