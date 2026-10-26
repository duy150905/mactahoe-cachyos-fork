#!/usr/bin/env bash
set -Eeuo pipefail

HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DRY=0
SKIP_PACKAGES=0
WITH_AUR=0
WITH_FLATPAK=0
NO_FIREFOX=0
NO_DCONF=0
USER="${USER:-$(id -un)}"
export USER
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
    --skip-packages) SKIP_PACKAGES=1 ;;
    --with-aur) WITH_AUR=1 ;;
    --with-flatpak) WITH_FLATPAK=1 ;;
    --no-firefox) NO_FIREFOX=1 ;;
    --no-dconf) NO_DCONF=1 ;;
    -h | --help)
        sed -n '2,5p' "${BASH_SOURCE[0]}"
        exit 0
        ;;
    *) die "Tham số không hợp lệ: $1 (xem --help)" ;;
    esac
    shift
done

STATE_DIR="$HOME/.local/state/mactahoe-restore"
mkdir -p "$STATE_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$STATE_DIR/install-$STAMP.log"
exec > >(tee -a "$LOG_FILE") 2>&1
trap 'printf "\nLỗi tại dòng %s: %s\nChi tiết: %s\n" "$LINENO" "$BASH_COMMAND" "$LOG_FILE" >&2' ERR

[ "$EUID" -ne 0 ] || die "Hãy chạy bằng tài khoản thường, không dùng sudo."
for need in manifest.env paths.txt files; do
    [ -e "$HERE/$need" ] || die "Thiếu '$need' trong thư mục cài đặt. Bản chụp bị thiếu file?"
done
\. "$HERE/manifest.env"
\. /etc/os-release 2>/dev/null || true
case " ${ID:-} ${ID_LIKE:-} " in
*" cachyos "* | *" arch "*) ;;
*) die "Bản chụp này dành cho CachyOS/Arch; máy này là '${PRETTY_NAME:-unknown}'." ;;
esac
command -v gnome-shell >/dev/null 2>&1 || die "Chưa cài GNOME Shell."
shell_major="$(gnome-shell --version | grep -oE '[0-9]+' | head -n1 || true)"
if [ -n "${GNOME_SHELL_MAJOR:-}" ] && [ "$shell_major" != "$GNOME_SHELL_MAJOR" ]; then
    warn "Bản chụp từ GNOME Shell $GNOME_SHELL_MAJOR nhưng máy này là $shell_major: extension có thể cần cập nhật."
fi
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -S "/run/user/$UID/bus" ]; then
    export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$UID/bus"
fi
[ -n "${DBUS_SESSION_BUS_ADDRESS:-}" ] || die "Không có D-Bus phiên đăng nhập; hãy chạy trong terminal của phiên GNOME."
[ "$DRY" -eq 0 ] || info "Chế độ --dry-run: chỉ hiển thị, không thay đổi gì."

sed_repl() { printf '%s' "$1" | sed 's/[&#\\]/\\&/g'; }
HOME_REPL="$(sed_repl "$HOME")"
mapfile -t PATHS <"$HERE/paths.txt"

info "Sao lưu cấu hình hiện có"
existing=()
for rel in "${PATHS[@]}"; do
    if [ -e "$HOME/$rel" ] || [ -L "$HOME/$rel" ]; then existing+=("$rel"); fi
done
BACKUP_TAR="$STATE_DIR/backup-$STAMP.tar.gz"
if [ "${#existing[@]}" -gt 0 ]; then
    act tar -C "$HOME" -czf "$BACKUP_TAR" -- "${existing[@]}"
fi
if [ "$DRY" -eq 0 ] && command -v dconf >/dev/null 2>&1; then
    dconf dump / >"$STATE_DIR/dconf-before-$STAMP.ini" || true
fi

if [ "$SKIP_PACKAGES" -eq 0 ]; then
    info "Cài gói pacman"
    if [ -s "$HERE/packages-theme.txt" ]; then
        mapfile -t PKGS < <(grep -vE '^\s*(#|$)' "$HERE/packages-theme.txt")
        if [ "$DRY" -eq 1 ]; then
            printf '[dry-run] sudo pacman -S --needed --noconfirm %s\n' "${PKGS[*]}"
        else
            command -v sudo >/dev/null 2>&1 || die "Cần sudo để cài gói (hoặc dùng --skip-packages)."
            sudo -v || die "Không lấy được quyền sudo."
            if ! sudo pacman -S --needed --noconfirm "${PKGS[@]}"; then
                warn "Cài hàng loạt thất bại; thử từng gói để tìm gói lỗi."
                for pkg in "${PKGS[@]}"; do
                    sudo pacman -S --needed --noconfirm "$pkg" || warn "Không cài được: $pkg"
                done
            fi
        fi
    fi
    if [ -s "$HERE/packages-foreign.txt" ]; then
        if [ "$WITH_AUR" -eq 1 ]; then
            helper=""
            for h in paru yay; do command -v "$h" >/dev/null 2>&1 && {
                helper="$h"
                break
            }; done
            if [ -n "$helper" ]; then
                while IFS= read -r pkg; do
                    [ -n "$pkg" ] || continue
                    act "$helper" -S --needed --noconfirm "$pkg" || warn "Không cài được gói AUR: $pkg"
                done <"$HERE/packages-foreign.txt"
            else
                warn "--with-aur: không thấy paru/yay. Danh sách gói AUR: packages-foreign.txt"
            fi
        else
            info "Bỏ qua gói AUR ($(wc -l <"$HERE/packages-foreign.txt") gói); thêm --with-aur nếu muốn. Danh sách: packages-foreign.txt"
        fi
    fi
    if [ "$WITH_FLATPAK" -eq 1 ] && [ -s "$HERE/flatpak-apps.txt" ] && command -v flatpak >/dev/null 2>&1; then
        while IFS= read -r app; do
            [ -n "$app" ] || continue
            act flatpak install -y --noninteractive flathub "$app" || warn "Không cài được flatpak: $app"
        done <"$HERE/flatpak-apps.txt"
    fi
fi

info "Khôi phục file cấu hình, theme, icon, font, extension"
for rel in "${PATHS[@]}"; do
    src="$HERE/files/$rel"
    [ -e "$src" ] || [ -L "$src" ] || continue
    act mkdir -p "$HOME/$(dirname "$rel")"
    act cp -a -- "$src" "$HOME/$(dirname "$rel")/"
done
if [ "$DRY" -eq 0 ]; then
    for rel in "${PATHS[@]}"; do
        [ -e "$HOME/$rel" ] || continue
        while IFS= read -r f; do
            sed -i "s#@HOME@#$HOME_REPL#g" "$f"
        done < <(grep -rIlF --exclude-dir=icons --exclude-dir=themes --exclude-dir=fonts \
            --exclude-dir=extensions -- '@HOME@' "$HOME/$rel" 2>/dev/null || true)
    done
    command -v fc-cache >/dev/null 2>&1 && fc-cache -f "$HOME/.local/share/fonts" >/dev/null 2>&1 || true
    for schema_dir in "$HOME"/.local/share/gnome-shell/extensions/*/schemas; do
        [ -d "$schema_dir" ] || continue
        glib-compile-schemas "$schema_dir" || warn "Không biên dịch được schema: $schema_dir"
    done
    command -v update-desktop-database >/dev/null 2>&1 &&
        update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true
    for icon_dir in "$HOME"/.local/share/icons/*/; do
        [ -f "${icon_dir}index.theme" ] && command -v gtk-update-icon-cache >/dev/null 2>&1 &&
            gtk-update-icon-cache -q -f "$icon_dir" >/dev/null 2>&1 || true
    done
fi

if [ "$NO_DCONF" -eq 0 ] && [ -s "$HERE/dconf/gnome.ini" ]; then
    info "Nạp thiết lập GNOME (dconf)"
    if [ "$DRY" -eq 1 ]; then
        printf '[dry-run] dconf load / < dconf/gnome.ini (đã thay @HOME@, lọc app ghim không tồn tại)\n'
    else
        TMP_INI="$(mktemp)"
        sed "s#@HOME@#$HOME_REPL#g" "$HERE/dconf/gnome.ini" >"$TMP_INI"
        python3 - "$TMP_INI" <<'PY'
import ast, os, re, sys
path = sys.argv[1]
dirs = ["/usr/share/applications", os.path.expanduser("~/.local/share/applications"),
        "/var/lib/flatpak/exports/share/applications",
        os.path.expanduser("~/.local/share/flatpak/exports/share/applications")]
out = []
for line in open(path, encoding="utf-8"):
    m = re.match(r"^favorite-apps=(.*)$", line.rstrip("\n"))
    if m:
        try:
            apps = ast.literal_eval(m.group(1).replace("@as ", ""))
            apps = [a for a in apps if any(os.path.exists(os.path.join(d, a)) for d in dirs)]
            line = "favorite-apps=[" + ", ".join(repr(a) for a in apps) + "]\n"
        except (ValueError, SyntaxError):
            pass
    out.append(line)
open(path, "w", encoding="utf-8").writelines(out)
PY
        dconf load / <"$TMP_INI" || warn "dconf load báo lỗi"
        rm -f -- "$TMP_INI"
    fi
fi

if [ -s "$HERE/units-enabled.txt" ]; then
    info "Bật dịch vụ systemd --user"
    act systemctl --user daemon-reload || warn "daemon-reload thất bại"
    while IFS= read -r unit; do
        [ -n "$unit" ] || continue
        act systemctl --user enable --now "$unit" || warn "Không bật được $unit"
    done <"$HERE/units-enabled.txt"
fi

if [ "$NO_FIREFOX" -eq 0 ] && [ -d "$HERE/firefox" ] && [ -n "$(ls -A "$HERE/firefox" 2>/dev/null)" ]; then
    info "Khôi phục theme Firefox"
    if pgrep -u "$UID" -x firefox >/dev/null 2>&1; then
        warn "Firefox đang chạy; hãy đóng hẳn rồi mở lại để nhận theme."
    fi
    first_snap="$(find "$HERE/firefox" -mindepth 1 -maxdepth 1 -type d | sort | head -n1)"
    for root in "$HOME/.mozilla/firefox" "$HOME/.config/mozilla/firefox" \
        "$HOME/.var/app/org.mozilla.firefox/.mozilla/firefox" \
        "$HOME/.var/app/org.mozilla.firefox/config/mozilla/firefox"; do
        [ -d "$root" ] || continue
        while IFS= read -r -d '' prefs; do
            profile="${prefs%/prefs.js}"
            if [ -d "$profile/chrome" ] && [ ! -e "$profile/chrome.restore-backup" ]; then
                act cp -a "$profile/chrome" "$profile/chrome.restore-backup"
            fi
            [ -d "$first_snap/chrome" ] && act cp -a "$first_snap/chrome" "$profile/"
            if [ -f "$first_snap/user.js" ]; then
                [ -f "$profile/user.js" ] && [ ! -e "$profile/user.js.restore-backup" ] &&
                    act cp -a "$profile/user.js" "$profile/user.js.restore-backup"
                act cp "$first_snap/user.js" "$profile/user.js"
            fi
        done < <(find "$root" -mindepth 2 -maxdepth 3 -type f -name prefs.js -print0)
    done
fi

if [ -f "$HERE/hooks/post-install.sh" ]; then
    info "Chạy hooks/post-install.sh (lệnh sửa lỗi do bạn tự thêm)"
    act bash "$HERE/hooks/post-install.sh" || warn "hooks/post-install.sh báo lỗi"
fi

if [ "$DRY" -eq 0 ]; then
    info "Kiểm tra kết quả"
    failures=0
    check_fail() {
        warn "Kiểm tra thất bại: $*"
        failures=$((failures + 1))
    }
    for desktop in "$HOME"/.local/share/applications/*.desktop; do
        [ -f "$desktop" ] || continue
        grep -qF '@HOME@' "$desktop" && check_fail "còn @HOME@ trong ${desktop##*/}"
        while IFS='=' read -r key value; do
            case "$key" in
            Exec | TryExec)
                case "$value" in
                "$HOME"/*) [ -x "${value%% *}" ] || check_fail "${desktop##*/}: $key trỏ tới file không chạy được (${value%% *})" ;;
                esac
                ;;
            esac
        done <"$desktop"
    done
    for rel in "${PATHS[@]}"; do
        if [ -e "$HOME/$rel" ] && grep -rIlF --exclude-dir=icons --exclude-dir=themes --exclude-dir=fonts \
            --exclude-dir=extensions -- '@HOME@' "$HOME/$rel" >/dev/null 2>&1; then
            check_fail "còn placeholder @HOME@ trong ~/$rel"
        fi
    done
    if [ -f "$HERE/extensions.tsv" ]; then
        while IFS=$'\t' read -r uuid state _ where; do
            case "$uuid" in '#'* | '') continue ;; esac
            [ "$state" = "bật" ] || continue
            if [ ! -d "$HOME/.local/share/gnome-shell/extensions/$uuid" ] &&
                [ ! -d "/usr/share/gnome-shell/extensions/$uuid" ]; then
                warn "Extension đang bật ở máy nguồn nhưng chưa có ở đây: $uuid ($where). Cài từ extensions.gnome.org hoặc gói pacman."
            fi
        done <"$HERE/extensions.tsv"
    fi
    for conf in "$HOME"/.config/conky/mactahoe-*.conf; do
        [ -f "$conf" ] || continue
        grep -q "output_backend *= *'x11'" "$conf" || warn "$(basename "$conf") không ép backend X11 (Conky >= 1.25 trên Wayland có thể crash)."
    done
    [ "$failures" -eq 0 ] || die "$failures kiểm tra không đạt. Xem log: $LOG_FILE"
fi

printf '\nHoàn tất%s. Đăng xuất rồi đăng nhập lại để GNOME nạp theme và extension.\n' \
    "$([ "$WARNINGS" -gt 0 ] && printf ' (có %s cảnh báo, xem phía trên)' "$WARNINGS")"
printf 'Sao lưu bản cũ: %s\nLog: %s\n' "$BACKUP_TAR" "$LOG_FILE"
printf 'Muốn hoàn tác: tar -C ~ -xzf %s   rồi   dconf load / < %s/dconf-before-%s.ini\n' "$BACKUP_TAR" "$STATE_DIR" "$STAMP"
