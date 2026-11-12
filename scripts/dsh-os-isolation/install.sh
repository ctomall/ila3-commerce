#!/bin/sh
# Install the per-employee DSH OS isolation (must run as root).
#
#   install.sh [--legacy-root /home/pro/.local/state/ila3-dsh/root]
#
# Idempotent. Steps:
#   1. dsh-runtime group + /srv/dsh/{homes,workspaces,tmp} + /run/dsh-agent
#   2. root-owned runner and provisioner
#   3. sudoers: pro may run the provisioner as root and the runner as dsh-* users
#   4. migrate existing employee DSH homes from the legacy single-user root
#   5. daily prune timer (root) for expired run workspaces
set -eu

HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT="${OM_DSH_ISOLATION_ROOT:-/srv/dsh}"
LEGACY_ROOT="/home/pro/.local/state/ila3-dsh/root"
[ "${1:-}" = "--legacy-root" ] && { LEGACY_ROOT="$2"; shift 2 || true; }

[ "$(id -u)" = "0" ] || { echo "install.sh must run as root" >&2; exit 1; }

getent group dsh-runtime >/dev/null 2>&1 || groupadd --system dsh-runtime
usermod -aG dsh-runtime pro 2>/dev/null || true

install -d -m 0755 -o root -g root "$ROOT" "$ROOT/homes" "$ROOT/workspaces" "$ROOT/tmp"
install -d -m 0711 -o root -g root /run/dsh-agent
install -d -m 0755 -o root -g root /usr/local/lib/dsh-agent
install -m 0555 -o root -g root "$HERE/run-with-env.sh" /usr/local/lib/dsh-agent/run-with-env
install -m 0755 -o root -g root "$HERE/provision.sh" /usr/local/sbin/dsh-agent-provision
install -m 0644 -o root -g root "$HERE/dsh-agent-prune.service" /etc/systemd/system/dsh-agent-prune.service
install -m 0644 -o root -g root "$HERE/dsh-agent-prune.timer" /etc/systemd/system/dsh-agent-prune.timer

# The app may only call the provisioner as root and the runner as the specific
# dsh-* users the provisioner itself created (one sudoers file per user).
cat > /etc/sudoers.d/dsh-agent-provision <<SUDO
pro ALL=(root) NOPASSWD: /usr/local/sbin/dsh-agent-provision *
SUDO
chmod 440 /etc/sudoers.d/dsh-agent-provision
visudo -cf /etc/sudoers.d/dsh-agent-provision >/dev/null

systemctl daemon-reload
systemctl enable --now dsh-agent-prune.timer >/dev/null 2>&1 || true

if [ -d "$LEGACY_ROOT/homes" ]; then
  for dir in "$LEGACY_ROOT/homes"/*; do
    [ -d "$dir" ] || continue
    hash="$(basename "$dir")"
    printf %s "$hash" | grep -Eq '^[0-9a-f]{32}$' || continue
    /usr/local/sbin/dsh-agent-provision adopt "$hash" >/dev/null
    if command -v rsync >/dev/null 2>&1; then
      rsync -a "$dir/" "$ROOT/homes/$hash/"
    else
      cp -a "$dir/." "$ROOT/homes/$hash/"
    fi
    chown -R "dsh-$(printf %s "$hash" | cut -c1-16):dsh-$(printf %s "$hash" | cut -c1-16)" "$ROOT/homes/$hash"
    chmod 700 "$ROOT/homes/$hash"
    echo "migrated home $hash"
  done
fi

echo "installed: user=dsh-<hash16> root=$ROOT runner=/usr/local/lib/dsh-agent/run-with-env"
