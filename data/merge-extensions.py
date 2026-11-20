#!/usr/bin/env python3
"""Bật các extension 'bật' trong extensions.tsv mà KHÔNG ghi đè danh sách extension hiện có.

Dùng: merge-extensions.py [--dry-run] data/extensions.tsv
"""
import ast
import os
import subprocess
import sys

SCHEMA = "org.gnome.shell"
EXT_DIRS = (
    os.path.expanduser("~/.local/share/gnome-shell/extensions"),
    "/usr/share/gnome-shell/extensions",
)


def get_list(key):
    result = subprocess.run(["gsettings", "get", SCHEMA, key], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "gsettings get thất bại")
    text = result.stdout.strip()
    if text.startswith("@as"):
        text = text[3:].strip()
    return list(ast.literal_eval(text))


def set_value(key, value):
    subprocess.run(["gsettings", "set", SCHEMA, key, value], check=True)


def installed(uuid):
    return any(os.path.isdir(os.path.join(base, uuid)) for base in EXT_DIRS)


def wanted_from_tsv(path):
    wanted = []
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            if not raw.strip() or raw.startswith("#"):
                continue
            fields = raw.rstrip("\n").split("\t")
            if len(fields) >= 2 and fields[1].strip() == "bật":
                wanted.append(fields[0].strip())
    return wanted


def main(argv):
    dry = "--dry-run" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print("Thiếu đường dẫn extensions.tsv", file=sys.stderr)
        return 2
    wanted = wanted_from_tsv(paths[0])
    if dry:
        print("[dry-run] sẽ gộp vào enabled-extensions:", ", ".join(wanted))
        return 0

    missing = [u for u in wanted if not installed(u)]
    for uuid in missing:
        print(f"  ! chưa có extension {uuid} (cài gói pacman hoặc chép vào ~/.local/share/gnome-shell/extensions)")
    wanted = [u for u in wanted if u not in missing]

    enabled = get_list("enabled-extensions")
    disabled = get_list("disabled-extensions")
    new_enabled = enabled + [u for u in wanted if u not in enabled]
    new_disabled = [u for u in disabled if u not in wanted]

    if new_enabled != enabled:
        set_value("enabled-extensions", repr(new_enabled))
        print("  đã bật thêm:", ", ".join(u for u in new_enabled if u not in enabled))
    else:
        print("  = enabled-extensions đã đủ")
    if new_disabled != disabled:
        set_value("disabled-extensions", repr(new_disabled))
    # Extension người dùng phải được phép chạy thì User Themes mới có tác dụng
    set_value("disable-user-extensions", "false")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (RuntimeError, subprocess.CalledProcessError, OSError, ValueError, SyntaxError) as exc:
        print(f"Không gộp được danh sách extension: {exc}", file=sys.stderr)
        sys.exit(1)
