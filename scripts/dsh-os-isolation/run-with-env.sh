#!/bin/sh
# Root-owned, installed as /usr/local/lib/dsh-agent/run-with-env (0555).
#
# Executed by sudo as ONE employee's Unix user (dsh-<hash>). It reads the
# one-shot env file the CRM wrote for this run (mode 0640, group = that user),
# removes it, moves to the run workspace and execs the DSH command. Nothing in
# the argv carries a secret: the token and model key live only in the env file.
set -eu

env_file="${1:?env file required}"
shift
[ -r "$env_file" ] || { echo "dsh-agent: env file unreadable" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

rm -f "$env_file"

if [ -n "${DSH_RUN_CWD:-}" ]; then
  cd "$DSH_RUN_CWD"
fi

exec "$@"
