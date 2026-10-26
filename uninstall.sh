#!/usr/bin/env bash
set -Eeuo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$HOME/.local/state/mactahoe-restore"
DRY=0
YES=0
NO_DCONF=0
NO_RESTORE=0
BACKUP_TAR=""
WARNINGS=0

die() {
    printf 'Lỗi: %s\n' "$*" >&2
    exit 1
}
warn() {
    printf 'Cảnh báo: %s\n' "$*" >&2
    WARNINGS=$((WARNINGS + 1))
}
info() { printf '==> %s\n' "$*"; }
act() { if [ "$DRY" -eq 1 ]; then printf '[dry-run] %s\n' "$*"; else "$@"; fi; }

while [ "$#" -gt 0 ]; do
    case "$1" in
    --dry-run) DRY=1 ;;
    -y | --yes) YES=1 ;;
    --no-dconf) NO_DCONF=1 ;;
    --no-restore) NO_RESTORE=1 ;;
    --backup)
        shift
        [ "$#" -gt 0 ] || die "--backup cần đường dẫn file .tar.gz"
        BACKUP_TAR="$1"
        ;;
    -h | --help)
        printf 'Dùng: ./uninstall.sh [--dry-run] [--yes] [--no-dconf] [--no-restore] [--backup FILE.tar.gz]\n'
        printf 'Gỡ MacTahoe đã cài bằng install.sh rồi khôi phục bản sao lưu cũ nhất (trước lần cài đầu tiên).\n'
        exit 0
        ;;
    *) die "Tham số không hợp lệ: $1 (xem --help)" ;;
    esac
    shift
done

[ "$EUID" -ne 0 ] || die "Hãy chạy bằng tài khoản thường, không dùng sudo."
[ -n "${HOME:-}" ] || die "Biến HOME trống."
for need in paths.txt files; do
    [ -e "$HERE/$need" ] || die "Thiếu '$need' trong thư mục cài đặt."
done
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -S "/run/user/$UID/bus" ]; then
    export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$UID/bus"
fi

STAMP=""
if [ "$NO_RESTORE" -eq 0 ]; then
    if [ -z "$BACKUP_TAR" ] && [ -d "$STATE_DIR" ]; then
        BACKUP_TAR="$(find "$STATE_DIR" -maxdepth 1 -type f -name 'backup-*.tar.gz' | sort | head -n1)"
    fi
    if [ -n "$BACKUP_TAR" ] && [ -f "$BACKUP_TAR" ]; then
        STAMP="$(basename "$BACKUP_TAR" .tar.gz)"
        STAMP="${STAMP#backup-}"
    else
        BACKUP_TAR=""
        warn "Không tìm thấy bản sao lưu trong $STATE_DIR; sẽ chỉ gỡ file đã cài."
    fi
fi
DCONF_BEFORE=""
if [ -n "$STAMP" ] && [ -f "$STATE_DIR/dconf-before-$STAMP.ini" ]; then
    DCONF_BEFORE="$STATE_DIR/dconf-before-$STAMP.ini"
fi

info "Sẽ gỡ các file mà install.sh đã chép vào $HOME"
[ -z "$BACKUP_TAR" ] || info "Sẽ khôi phục từ: $BACKUP_TAR"
if [ "$YES" -eq 0 ] && [ "$DRY" -eq 0 ]; then
    printf 'Tiếp tục gỡ MacTahoe? [y/N] '
    read -r answer
    case "$answer" in y | Y | yes | YES) ;; *)
        echo "Đã hủy."
        exit 0
        ;;
    esac
fi

mapfile -t PATHS <"$HERE/paths.txt"

info "Dừng widget và dịch vụ systemd --user"
if [ -x "$HOME/.local/bin/mactahoe-widgets" ]; then
    act "$HOME/.local/bin/mactahoe-widgets" stop 2>/dev/null || true
fi
pkill -u "$UID" -f 'conky -c .*/mactahoe-' 2>/dev/null || true
if [ -s "$HERE/units-enabled.txt" ]; then
    while IFS= read -r unit; do
        [ -n "$unit" ] || continue
        act systemctl --user disable --now "$unit" 2>/dev/null || true
    done <"$HERE/units-enabled.txt"
fi

info "Tắt extension do bộ cài chép vào"
if command -v gnome-extensions >/dev/null 2>&1 && [ -d "$HERE/files/.local/share/gnome-shell/extensions" ]; then
    while IFS= read -r -d '' uuid; do
        act gnome-extensions disable "$uuid" 2>/dev/null || true
    done < <(find "$HERE/files/.local/share/gnome-shell/extensions" -mindepth 1 -maxdepth 1 -printf '%f\0')
fi

info "Gỡ extension Tahoe bất kể tên (gồm bản cũ UbuntuTahoe*)"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions"
if [ -d "$EXT_DIR" ]; then
    while IFS= read -r -d '' uuid; do
        command -v gnome-extensions >/dev/null 2>&1 && act gnome-extensions disable "$uuid" 2>/dev/null || true
        act rm -rf -- "$EXT_DIR/$uuid"
    done < <(find "$EXT_DIR" -mindepth 1 -maxdepth 1 -iname '*Tahoe*@adfoxtheme.github.io' -printf '%f\0')
fi

info "Xóa file đã cài"
for rel in "${PATHS[@]}"; do
    [ -n "$rel" ] || continue
    src="$HERE/files/$rel"
    [ -d "$src" ] || continue
    while IFS= read -r -d '' name; do
        [ -n "$name" ] || continue
        act rm -rf -- "$HOME/$rel/$name"
    done < <(find "$src" -mindepth 1 -maxdepth 1 -printf '%f\0')
done
act rm -rf -- "$HOME/.cache/mactahoe-widgets" "$HOME/.config/mactahoe-widgets"
[ "$DRY" -eq 1 ] || systemctl --user daemon-reload 2>/dev/null || true

if [ -n "$BACKUP_TAR" ]; then
    info "Khôi phục file từ bản sao lưu"
    act tar -C "$HOME" -xzf "$BACKUP_TAR" || warn "Giải nén bản sao lưu báo lỗi"
fi

if [ "$NO_DCONF" -eq 0 ] && command -v dconf >/dev/null 2>&1; then
    if [ -s "$HERE/dconf/gnome.ini" ]; then
        info "Đặt lại các khóa dconf mà bộ cài đã nạp"
        if [ "$DRY" -eq 1 ]; then
            printf '[dry-run] dconf reset từng khóa trong dconf/gnome.ini\n'
        else
            python3 - "$HERE/dconf/gnome.ini" <<'PY' | while IFS= read -r key; do dconf reset "$key" 2>/dev/null || true; done
import sys
section = ""
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.rstrip("\n")
    if line.startswith("[") and line.endswith("]"):
        section = line[1:-1]
    elif "=" in line and section:
        print("/" + section + "/" + line.split("=", 1)[0].strip())
PY
        fi
    fi
    if [ "$DRY" -eq 0 ]; then
        while IFS= read -r sub; do
            [ -n "$sub" ] || continue
            dconf reset -f "/org/gnome/shell/extensions/$sub" 2>/dev/null || true
        done < <(dconf list /org/gnome/shell/extensions/ 2>/dev/null | grep -i 'tahoe' || true)
    fi
    if [ -n "$DCONF_BEFORE" ]; then
        info "Nạp lại dconf như trước khi cài ($DCONF_BEFORE)"
        act bash -c 'dconf load / <"$1"' _ "$DCONF_BEFORE" || warn "dconf load báo lỗi"
    fi
fi

info "Khôi phục Firefox (nếu có bản sao lưu)"
for root in "$HOME/.mozilla/firefox" "$HOME/.config/mozilla/firefox" \
    "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox" \
    "$HOME/.var/app/org.mozilla.firefox/config/mozilla/firefox"; do
    [ -d "$root" ] || continue
    while IFS= read -r -d '' prefs; do
        profile="${prefs%/prefs.js}"
        if [ -d "$profile/chrome.restore-backup" ]; then
            act rm -rf -- "$profile/chrome"
            act mv "$profile/chrome.restore-backup" "$profile/chrome"
        fi
        if [ -f "$profile/user.js.restore-backup" ]; then
            act mv "$profile/user.js.restore-backup" "$profile/user.js"
        fi
    done < <(find "$root" -mindepth 2 -maxdepth 3 -type f -name prefs.js -print0)
done

if [ "$DRY" -eq 0 ]; then
    command -v fc-cache >/dev/null 2>&1 && fc-cache -f >/dev/null 2>&1 || true
    command -v update-desktop-database >/dev/null 2>&1 &&
        update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
    for icon_dir in "$HOME"/.local/share/icons/*/; do
        [ -f "${icon_dir}index.theme" ] && command -v gtk-update-icon-cache >/dev/null 2>&1 &&
            gtk-update-icon-cache -q -f "$icon_dir" >/dev/null 2>&1 || true
    done
fi

printf '\nĐã gỡ xong%s. Đăng xuất rồi đăng nhập lại để GNOME nạp lại giao diện.\n' \
    "$([ "$WARNINGS" -gt 0 ] && printf ' (có %s cảnh báo)' "$WARNINGS")"
printf 'Gói pacman đã cài không bị gỡ. Log và bản sao lưu vẫn nằm ở: %s\n' "$STATE_DIR"
