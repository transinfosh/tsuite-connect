#!/usr/bin/env bash
# Rename an existing control installation in place, preserving numeric identities and state.
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MODE="${1:---check}"
[[ "$MODE" == --check || "$MODE" == --apply ]] || { printf '用法: sudo %s [--check|--apply]\n' "$0" >&2; exit 1; }
[[ "$EUID" -eq 0 ]] || { printf '请使用 sudo 运行\n' >&2; exit 1; }
fail() { printf '迁移失败: %s\n' "$*" >&2; exit 1; }
operator_user=tsuite-support-operator
broker=/usr/local/bin/tsuite-support-console-action
if id tsuite-connect-operator >/dev/null 2>&1; then
	operator_user=tsuite-connect-operator
	broker=/usr/local/bin/tsuite-connect-console-action
fi
[[ -x "$broker" ]] || fail '缺少已安装的 broker'
check_sessions() {
	local sessions
	sessions="$(sudo -n -u "$operator_user" "$broker" list </dev/null)"
	if awk '$3 != "closed" && $3 != "expired" { found=1 } END { exit !found }' <<<"$sessions"; then
		fail '存在未结束会话，需在维护窗口迁移'
	fi
}
check_sessions
for name in tsuite_connect_console.py tsuite_connect_remote_action.py; do
	[[ -f "$REPO_ROOT/console/$name" ]] || fail "缺少 $name"
done
if [[ "$MODE" == --check ]]; then
	printf '检查通过：没有活动会话；可原地迁移账号、配置、状态和服务。\n'
	exit 0
fi
backup="/var/backups/tsuite-connect/$(date -u +%Y%m%dT%H%M%SZ)-rename"
install -d -m 0700 "$backup"
trap 'printf "迁移中断；备份目录：%s\n" "$backup" >&2' ERR
# Stop writers before taking a consistent SQLite/state snapshot.
systemctl stop tsuite-support-console.service tsuite-support-operator-gc.timer tsuite-support-operator-gc.service 2>/dev/null || true
systemctl stop tsuite-connect-console.service tsuite-connect-operator-gc.timer tsuite-connect-operator-gc.service 2>/dev/null || true
check_sessions
for path in /etc/tsuite-support-console /etc/tsuite-support-control /var/lib/tsuite-support-console \
	/usr/local/lib/tsuite-support-console \
	/etc/tsuite-connect-console /etc/tsuite-connect-control /var/lib/tsuite-connect-console \
	/usr/local/lib/tsuite-connect-console \
	/etc/sudoers.d/tsuite-deploy-operator /etc/sudoers.d/tsuite-support-portable /etc/sudoers.d/tsuite-connect-portable \
	/usr/local/bin/tsuite-support-console-action /usr/local/bin/tsuite-connect-console-action \
	/usr/local/bin/tsuite_support_activity.py /usr/local/bin/tsuite_connect_activity.py \
	/etc/systemd/system/tsuite-support-console.service /etc/systemd/system/tsuite-support-console.service.d \
	/etc/systemd/system/tsuite-support-operator-gc.service /etc/systemd/system/tsuite-support-operator-gc.timer \
	/etc/systemd/system/tsuite-connect-console.service /etc/systemd/system/tsuite-connect-console.service.d \
	/etc/systemd/system/tsuite-connect-operator-gc.service /etc/systemd/system/tsuite-connect-operator-gc.timer; do
	if [[ -e "$path" || -L "$path" ]]; then
		cp -a --parents "$path" "$backup/"
	fi
done
# Broker reads use ControlPersist; drain only its idle SSH masters after writers stop.
for socket in /var/lib/tsuite-support-operator/ssh-control-* /var/lib/tsuite-connect-operator/ssh-control-*; do
	if [[ -S "$socket" ]]; then
		sudo -n -u "$operator_user" ssh -F none -S "$socket" -O exit unused </dev/null
	fi
done
for _ in {1..30}; do
	pgrep -u "$(id -u "$operator_user")" >/dev/null || break
	sleep 0.1
done
for suffix in console operator; do
	if id "tsuite-support-$suffix" >/dev/null 2>&1; then
		if pgrep -u "$(id -u "tsuite-support-$suffix")" >/dev/null; then
			fail "旧账号仍有进程，尚未重命名: $suffix"
		fi
	fi
done
for suffix in console operator; do
	old="tsuite-support-$suffix"; new="tsuite-connect-$suffix"
	if id "$old" >/dev/null 2>&1; then
		! id "$new" >/dev/null 2>&1 || fail "新旧账号同时存在: $suffix"
		usermod -l "$new" "$old"
		if getent group "$old" >/dev/null; then groupmod -n "$new" "$old"; fi
	fi
done
for old in /etc/tsuite-support-console /etc/tsuite-support-control /var/lib/tsuite-support-console \
	/var/lib/tsuite-support-operator /usr/local/lib/tsuite-support-console; do
	new="${old/tsuite-support/tsuite-connect}"
	if [[ -d "$old" && ! -L "$old" ]]; then
		[[ ! -e "$new" ]] || fail "新旧目录同时存在: $old"
		mv "$old" "$new"
		ln -s "$new" "$old"
	fi
done
usermod -d /var/lib/tsuite-connect-operator tsuite-connect-operator
python3 - <<'PY'
import json
import os
import pathlib
import tempfile
for name in ('/etc/tsuite-connect-console/config.json', '/etc/tsuite-connect-control/action.json'):
    path = pathlib.Path(name)
    value = json.loads(path.read_text())
    def migrate(item):
        if isinstance(item, str):
            return item.replace('/etc/tsuite-support-', '/etc/tsuite-connect-').replace('/var/lib/tsuite-support-', '/var/lib/tsuite-connect-')
        if isinstance(item, dict):
            return {key: migrate(content) for key, content in item.items()}
        if isinstance(item, list):
            return [migrate(content) for content in item]
        return item
    value = migrate(value)
    if 'public_url' in value:
        old = value['public_url'].rstrip('/')
        if old.endswith('/support'):
            value.setdefault('github_callback_url', old + '/auth/github/callback')
            value['public_url'] = old[:-len('/support')] + '/connect'
    info = path.stat()
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.rename-')
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, ensure_ascii=False)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.chown(temporary, info.st_uid, info.st_gid)
    os.chmod(temporary, info.st_mode & 0o777)
    os.replace(temporary, path)
PY
install -m 0755 "$REPO_ROOT/console/tsuite_connect_console.py" /usr/local/lib/tsuite-connect-console/tsuite-connect-console
install -m 0755 "$REPO_ROOT/console/tsuite_connect_remote_action.py" /usr/local/bin/tsuite-connect-console-action
install -m 0644 "$REPO_ROOT/operator/tsuite_connect_activity.py" /usr/local/bin/tsuite_connect_activity.py
for name in tsuite_connect_portable.py tsuite_connect_activity.py tsuite_connect_windows.ps1 tsuite_connect_windows_relay.cs; do
	install -m 0644 "$REPO_ROOT/operator/$name" "/usr/local/lib/tsuite-connect-console/$name"
done
# Exact rules keep their original aliases and privileges, with renamed local principals and executable.
python3 - <<'PY'
from pathlib import Path
for path in (Path('/etc/sudoers.d/tsuite-deploy-operator'), Path('/etc/sudoers.d/tsuite-support-portable'), Path('/etc/sudoers.d/tsuite-connect-portable')):
    if path.is_file():
        text = path.read_text().replace('tsuite-support-', 'tsuite-connect-')
        path.write_text(text)
        path.chmod(0o440)
old = Path('/etc/sudoers.d/tsuite-support-portable')
if old.exists():
    old.rename('/etc/sudoers.d/tsuite-connect-portable')
PY
visudo -c >/dev/null
for name in console.service operator-gc.service operator-gc.timer; do
	old="/etc/systemd/system/tsuite-support-$name"
	new="/etc/systemd/system/tsuite-connect-$name"
	if [[ -f "$old" ]]; then
		sed 's/tsuite-support-/tsuite-connect-/g; s/TSuite GitHub support management console/TSuite Connect management console/g' "$old" >"$new"
	fi
done
if [[ -d /etc/systemd/system/tsuite-support-console.service.d ]]; then
	install -d -m 0755 /etc/systemd/system/tsuite-connect-console.service.d
	cp -a /etc/systemd/system/tsuite-support-console.service.d/. /etc/systemd/system/tsuite-connect-console.service.d/
fi
systemctl disable tsuite-support-console.service tsuite-support-operator-gc.timer 2>/dev/null || true
# Retain old executable paths as aliases for diagnostic scripts; only Connect services run.
ln -sfn /usr/local/bin/tsuite-connect-console-action /usr/local/bin/tsuite-support-console-action
ln -sfn /usr/local/lib/tsuite-connect-console/tsuite-connect-console /usr/local/lib/tsuite-connect-console/tsuite-support-console
ln -sfn /usr/local/bin/tsuite_connect_activity.py /usr/local/bin/tsuite_support_activity.py
systemctl daemon-reload
sudo -n -u tsuite-connect-operator /usr/local/bin/tsuite-connect-console-action self-test </dev/null >/dev/null
systemctl enable --now tsuite-connect-console.service tsuite-connect-operator-gc.timer
systemctl is-active --quiet tsuite-connect-console.service
curl --fail --silent --show-error --retry 20 --retry-connrefused --retry-delay 1 --retry-max-time 30 --max-time 3 \
	-o /dev/null http://127.0.0.1:8765/operator-client
python3 - <<'PY_CLEANUP'
from pathlib import Path
import shutil
root = Path('/usr/local/lib/tsuite-connect-console')
for path in root.glob('tsuite_support_*'):
    target = root / path.name.replace('tsuite_support_', 'tsuite_connect_', 1)
    if target.exists():
        path.unlink()
        path.symlink_to(target.name)
for name in ('console.service', 'operator-gc.service', 'operator-gc.timer'):
    Path('/etc/systemd/system/tsuite-support-' + name).unlink(missing_ok=True)
shutil.rmtree('/etc/systemd/system/tsuite-support-console.service.d', ignore_errors=True)
PY_CLEANUP
systemctl daemon-reload
printf '迁移完成；备份目录：%s\n'  "$backup"
