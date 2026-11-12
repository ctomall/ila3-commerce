#!/bin/sh
# Root-owned provisioning for the per-employee DSH Unix users.
#
#   provision.sh identity <tenantId> <organizationId> <userId> [runId]
#     -> prints {"user","home","workspace","tmp"} and creates:
#        - Unix user dsh-<first16 of sha256(tenant\0org\0user)> (system, nologin)
#        - /srv/dsh/{homes,workspaces,tmp}/<hash> owned by that user, mode 0700
#        - per-run workspace + /run/dsh-agent/<runId> owned pro:<user>, mode 2770
#        - /etc/sudoers.d/dsh-agent-<user>: pro may run the runner as that user
#
#   provision.sh prune <ttlDays>
#     -> removes run workspaces older than ttlDays and stale /run/dsh-agent
#        run directories. Must run as root (systemd timer).
#
# Idempotent: every step tolerates an existing user/dir/sudoers file.
set -eu

ROOT="${OM_DSH_ISOLATION_ROOT:-/srv/dsh}"
RUNTIME_GROUP="dsh-runtime"
APP_USER="pro"
RUNNER="/usr/local/lib/dsh-agent/run-with-env"
RUN_DIR="/run/dsh-agent"

die() { echo "dsh-agent-provision: $*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "must run as root"

identity_hash() {
  printf '%s\0%s\0%s' "$1" "$2" "$3" | sha256sum | cut -c1-32
}

ensure_group() {
  getent group "$RUNTIME_GROUP" >/dev/null 2>&1 || groupadd --system "$RUNTIME_GROUP"
}

ensure_user() {
  uname="$1"; home="$2"
  ensure_group
  if ! getent passwd "$uname" >/dev/null 2>&1; then
    useradd --system --no-create-home --home-dir "$home" --shell /usr/sbin/nologin "$uname"
  fi
  usermod -aG "$RUNTIME_GROUP" "$uname" 2>/dev/null || true
  sudoers="/etc/sudoers.d/dsh-agent-$uname"
  if [ ! -f "$sudoers" ] || ! grep -qF "$uname" "$sudoers"; then
    umask 077
    printf '%s ALL=(%s) NOPASSWD: %s *\n' "$APP_USER" "$uname" "$RUNNER" > "$sudoers"
    chmod 440 "$sudoers"
    visudo -cf "$sudoers" >/dev/null || { rm -f "$sudoers"; die "generated sudoers rule is invalid"; }
  fi
}

adopt_hash() {
  hash="$1"
  case "$hash" in
     ????????????????????????????????) ;;
     *) die "adopt needs a 32-character identity hash";;
  esac
  short="$(printf %s "$hash" | cut -c1-16)"
  uname="dsh-$short"
  home="$ROOT/homes/$hash"
  workspace="$ROOT/workspaces/$hash"
  ensure_user "$uname" "$home"
  for dir in "$home" "$workspace" "$ROOT/tmp/$hash"; do
    mkdir -p "$dir"
    chown -R "$uname:$uname" "$dir"
    chmod 700 "$dir"
  done
  printf '{"user":"%s","home":"%s","workspace":"%s","tmp":"%s"}\n' "$uname" "$home" "$workspace" "$ROOT/tmp/$hash"
}

provision_identity() {
  tenant="$1"; org="$2"; user="$3"; run_id="${4:-}"
  [ -n "$tenant" ] && [ -n "$org" ] && [ -n "$user" ] || die "identity needs tenant, org and user"
  hash="$(identity_hash "$tenant" "$org" "$user")"
  short="$(printf %s "$hash" | cut -c1-16)"
  uname="dsh-$short"
  home="$ROOT/homes/$hash"
  workspace="$ROOT/workspaces/$hash"

  ensure_user "$uname" "$home"

  for dir in "$home" "$workspace" "$ROOT/tmp/$hash"; do
    mkdir -p "$dir"
    chown -R "$uname:$uname" "$dir"
    chmod 700 "$dir"
  done

  if [ -n "$run_id" ]; then
    run_ws="$workspace/$run_id"
    mkdir -p "$run_ws"
    chown "$uname:$uname" "$run_ws"
    chmod 700 "$run_ws"
    mkdir -p "$RUN_DIR/$run_id"
    chown "$APP_USER:$uname" "$RUN_DIR/$run_id"
    chmod 2770 "$RUN_DIR/$run_id"
  else
    run_ws=""
  fi

  printf '{"user":"%s","home":"%s","workspace":"%s","tmp":"%s"}\n' \
    "$uname" "$home" "$run_ws" "$ROOT/tmp/$hash"
}

prune() {
  ttl_days="${1:-7}"
  case "$ttl_days" in *[!0-9]*|'') die "ttlDays must be an integer";; esac
  [ -d "$ROOT/workspaces" ] && find "$ROOT/workspaces" -mindepth 2 -maxdepth 2 -type d -mtime "+$ttl_days" -exec rm -rf {} + || true
  [ -d "$RUN_DIR" ] && find "$RUN_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +0 -exec rm -rf {} + || true
}

case "${1:-}" in
  identity) shift; provision_identity "$@";;
  adopt) shift; adopt_hash "$@";;
  prune) shift; prune "$@";;
  *) die "usage: provision.sh identity <tenant> <org> <user> [runId] | adopt <hash> | prune <ttlDays>";;
esac
