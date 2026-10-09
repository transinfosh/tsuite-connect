#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_PATH="${TSUITE_SUPPORT_INSTALL_PATH:-/usr/local/bin/tsuite-connect}"

[[ "$EUID" -eq 0 ]] || { printf '请使用 sudo 运行\n' >&2; exit 1; }
[[ -f "$SCRIPT_DIR/tsuite-connect" ]] || { printf '缺少 tsuite-support\n' >&2; exit 1; }
python3 -m py_compile "$SCRIPT_DIR/tsuite-connect"
install -D -m 0755 "$SCRIPT_DIR/tsuite-connect" "$INSTALL_PATH"
install -m 0644 "$SCRIPT_DIR/tsuite_connect_activity.py" "$(dirname "$INSTALL_PATH")/tsuite_connect_activity.py"
printf '安装完成: %s\n' "$INSTALL_PATH"
