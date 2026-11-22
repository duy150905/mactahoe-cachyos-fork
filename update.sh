#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"
git pull origin main
echo "Đã cập nhật bộ giao diện thành công!"
