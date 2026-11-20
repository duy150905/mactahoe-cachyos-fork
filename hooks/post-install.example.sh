#!/usr/bin/env bash
# Mẫu lệnh chạy riêng sau khi cài xong.
# Đổi tên file này thành post-install.sh (đã được .gitignore bỏ qua) và thêm lệnh của bạn;
# install.sh sẽ tự chạy nó ở cuối.
set -Eeuo pipefail

# Ví dụ:
# gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
